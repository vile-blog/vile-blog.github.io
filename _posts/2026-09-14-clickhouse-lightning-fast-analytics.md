---
title: "Paper Notes: ClickHouse — Lightning Fast Analytics for Everyone"
date: 2026-09-14 10:20:00 +0700
excerpt: "ClickHouse treats every LSM 'level' as equal, skips write-ahead logging entirely, and still calls itself ACID-adjacent. My notes on the tradeoffs behind its speed."
categories: [papers]
tags: ["ClickHouse", "OLAP", "Columnar Storage", "Query Execution"]
paper_title: "ClickHouse - Lightning Fast Analytics for Everyone"
paper_authors: "Schulze, Schreiber, Yatsishin, Dahimene, Milovidov — ClickHouse Inc., PVLDB Vol. 17, No. 12, 2024"
paper_url: "https://doi.org/10.14778/3685800.3685802"
---

*Paper: ["ClickHouse - Lightning Fast Analytics for Everyone"](https://doi.org/10.14778/3685800.3685802) — Schulze et al., ClickHouse Inc., VLDB 2024.*

Of the four papers in this batch, this is the one about a system I'd actually used before reading the paper — mostly for dashboards — without understanding *why* it felt so different from a row store under load. Reading the architecture paper filled in a lot of "oh, that's why" moments.

## The storage engine treats an LSM tree's "levels" as unnecessary

ClickHouse's `MergeTree*` family is LSM-tree-inspired but makes one structural change I hadn't seen elsewhere: instead of organizing parts (the immutable on-disk units created by each insert) into levels the way classic LSM trees do, **all parts are treated as equal**, and a background job can merge any set of them together once they cross a size threshold. The tradeoff this creates: because there's no implicit chronological ordering from a level hierarchy anymore, updates and deletes can't rely on the usual tombstone-at-a-higher-level trick — ClickHouse needs separate mechanisms for that (more below). In exchange, merges aren't constrained to same-level parts, which seems to give more scheduling freedom to the background merge process.

The other detail that surprised me: **ClickHouse writes inserts directly to disk and has no write-ahead log**, unlike most LSM-based stores. It leans on parts themselves being the durability unit. Combined with the fact that ClickHouse doesn't force `fsync` on new parts by default, the paper is refreshingly upfront that this trades a small risk of data loss on power failure for insert throughput — and that this is a deliberate call because their target workloads (observability, analytics) tolerate that risk far better than an OLTP workload would.

## Data pruning is three separate mechanisms, not one

I'd only really known ClickHouse for being "fast," and the paper breaks that down into three distinct pruning layers that each solve a different shape of query:

1. **Primary key index** — sparse (one entry per 8,192-row "granule," not per row), so a table of 8.1 million rows can be indexed in ~1,000 entries and kept fully in memory. Good for equality/range predicates on the sort-order columns.
2. **Projections** — literally a second copy of the table, sorted by a different key, populated lazily from new inserts. This is the "duplicate the data, keyed differently, to serve a different query shape" pattern — expensive in storage and merge overhead, but the optimizer picks between the main table and a projection based on estimated I/O cost automatically.
3. **Skipping indices** — lightweight metadata per block of granules (min/max values, small sets of unique values, or Bloom filters), for columns that aren't part of the sort key at all.

The mental model I came away with: primary key index handles "I sorted for this," projections handle "I expected to also query this way and pre-paid for it," and skipping indices handle "I didn't plan for this specific filter but can still avoid scanning garbage."

## Merge-time transformation instead of a separate ETL step

This is the part of the design I found most elegant. Rather than treating aggregation/rollups/archiving as a separate batch job outside the database, ClickHouse folds them into the same background merge process that's already combining parts:

- **Replacing merges** keep only the newest version of a row (by primary key), which doubles as a merge-time update mechanism.
- **Aggregating merges** combine partial aggregation states into materialized views *incrementally*, as each new part lands — not by re-scanning the whole source table on a schedule the way many databases refresh materialized views.
- **TTL merges** move, recompress, or delete a part wholesale once every row in it ages past a threshold — checking a condition against the whole part rather than per-row, which the authors note is a deliberate simplification that still covers the vast majority of real aging policies.

None of this blocks concurrent inserts, because it all happens in the same background process that was already going to run.

## Their honest answer to "is it ACID?" — no, and here's exactly why

I appreciated that the paper doesn't dodge this. Queries run against a snapshot of parts taken at query start (an MVCC variant), so isolation is snapshot-like — but because a single statement can touch and create multiple parts, and the reference-counting scheme only prevents in-flight parts from being deleted (not from being atomically swapped as a set), the paper states plainly that statements aren't ACID-compliant in general — only in the narrow case where every concurrent write happens to land inside a single part. That's a genuinely different contract than Aurora DSQL's snapshot isolation, and it's the right one for the workload — most ClickHouse use cases are write-heavy analytics pipelines that already tolerate a small risk of losing the newest, not-yet-`fsync`'d rows, in exchange for ingest speed.

## Replication is Raft for coordination, not for data

Replication uses a small ensemble of "Keeper" processes (a from-scratch Raft implementation, drop-in-compatible with ZooKeeper) to maintain a **replication log** of state transitions (insert/merge/mutation/DDL) — but the log entries reference operations, and nodes replay them asynchronously, fetching actual part data peer-to-peer rather than shipping row data through consensus. Replicated tables are explicitly only *eventually* consistent as a result, with an option to wait for a quorum synchronously when a caller needs it. It's a good example of using consensus for exactly the coordination problem (who did what, in what order) and not routing bulk data through it.

## Vectorized execution, but with a hardware-detection twist

The query engine follows the MonetDB/X100 vectorized model (operators consume/produce chunks of rows, not one row at a time), which I'd seen before. What I hadn't seen: ClickHouse compiles multiple variants of hot inner loops — a portable scalar version, an auto-vectorized AVX2 version, a hand-written AVX-512 version — and picks the fastest one **at runtime** based on the CPU's `cpuid`. That's how they claim to run on hardware as old as 15 years while still getting full benefit from a modern server's instruction set, without needing separate builds.

## Why this one felt different from the two Aurora papers

Aurora and DSQL are both OLTP-shaped: the hard problem is coordinating conflicting writes safely and cheaply. ClickHouse barely has that problem — it optimizes for the opposite corner of the design space, where writes are mostly append-only and the hard problem is *reading* efficiently at petabyte scale with high concurrency. Reading all three back to back was a good reminder that "distributed database" isn't one design problem; OLTP and OLAP systems are solving almost disjoint sets of hard problems, and the architectures reflect that from the storage layer up.
