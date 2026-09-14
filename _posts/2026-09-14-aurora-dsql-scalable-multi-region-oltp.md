---
title: "Paper Notes: Aurora DSQL — Scalable, Multi-Region OLTP"
date: 2026-09-14 10:15:00 +0700
excerpt: "DSQL gets multi-region strong consistency down to one cross-region round trip per commit, not per statement, by disaggregating literally everything — including who decides if a transaction can commit."
categories: [papers]
tags: ["Aurora DSQL", "Distributed SQL", "OLTP", "Multi-Region", "Concurrency Control"]
paper_title: "Aurora DSQL: Scalable, Multi-Region OLTP"
paper_authors: "Brooker, Bowes, Hershey, van der Merwe, Morle, Strydom — AWS, arXiv 2026"
paper_url: "https://arxiv.org/abs/2607.13276"
---

*Paper: ["Aurora DSQL: Scalable, Multi-Region OLTP"](https://arxiv.org/abs/2607.13276) — Brooker et al., AWS.*

This is the paper in this batch that felt most like reading a distributed systems design from scratch rather than an evolution of something existing. The headline goal is blunt: strongly consistent, multi-region, active-active SQL, without making every statement pay a cross-region round trip. The mechanism they land on is to disaggregate the database into more independent pieces than I'd seen before, and to be extremely disciplined about *when* those pieces are allowed to talk to each other.

## Five services, each doing one thing

DSQL splits into: **Query Processors** (stateless, one per active connection, running inside a Firecracker microVM with an embedded PostgreSQL engine for parsing/planning/wire protocol only), **Storage nodes** (sharded by key range, serving MVCC reads), **Adjudicators** (decide whether a transaction can commit — sharded by key, not tied to storage sharding), **Journal** (an ordered, durable, atomic commit log — the same primitive AWS reuses across S3, DynamoDB, and MemoryDB), and **Crossbar** (merges multiple Journals' streams into a per-shard order for storage to consume).

The detail I found most interesting: **adjudicator sharding and storage sharding are deliberately independent.** A database with heavy reads and light writes can run many storage shards behind a single adjudicator shard. That's a genuinely different lever than most sharded systems give you — it decouples "how do I scale reads" from "how do I scale conflict detection" instead of forcing one sharding scheme to serve both.

## OCC + MVCC instead of locks — and why that avoids a specific failure mode

DSQL picks Optimistic Concurrency Control for writes and snapshot isolation as its (only) isolation level, explicitly to avoid the standard OCC complaint of high abort rates: MVCC means every read comes from a consistent snapshot, so a transaction is never aborted just because it read something that later changed. Snapshot isolation specifically means transactions only conflict — and abort — on **write-write** conflicts, not read-write conflicts, and since most OLTP writes (`UPDATE`, unique-key `INSERT`) are also reads, that's a real reduction in abort rate versus serializable isolation.

What stuck with me is *why* they avoid pessimistic locking at cloud scale, not just that they avoid it: with locks held across a network round trip, a client that pauses — a GC pause, a retry storm, or even an operator who's stepped away from their desk mid-transaction — blocks every other client waiting on that lock. OCC structurally can't do that: no client can ever block another client, because nothing is held across a wait.

## The commit protocol: one round of cross-region communication, not per-statement

This is the actual point of the paper. Reads are served locally against a snapshot timestamp with no coordination at all — the storage layer just waits until it's caught up to the requested timestamp. Writes buffer *locally inside the Query Processor* and touch nothing else until `COMMIT`. At commit time:

1. The adjudicator(s) owning the written keys check for write-write conflicts against everything committed between the transaction's start and commit timestamps.
2. If clean, one adjudicator writes the transaction to its Journal — atomically, and only once, even across a multi-adjudicator transaction (their 2PC variant elects one adjudicator to actually do the write; the others just vote and hold a time-bounded promise not to commit conflicting transactions).
3. In the multi-region case, that Journal write requires durability in two-of-three regions — one round of cross-region communication, period. Not one per statement.

The benchmark numbers make the payoff concrete: the RTT between `us-east-1` and `us-west-2` averages ~62ms, but because a 3-region Journal only needs 2-of-3 to commit, an `us-east-1`/`us-west-2`/`us-east-2` deployment's actual commit latency is bounded by the *closest* second region (~11.5ms p50 to `us-east-2`) rather than the full cross-continent hop. Against a pessimistic-locking competitor, their normalized-latency chart shows that competitor's latency growing linearly with statements-per-transaction (more round trips to hold lock state), while DSQL's stays flat regardless of region.

## Two exceptions to "pure" snapshot isolation that I appreciated them naming

Academic snapshot isolation doesn't cleanly cover schema changes or explicit locking, and the paper is upfront about where they had to bolt on stronger guarantees rather than pretend the model is complete: an `ALTER TABLE` concurrent with an `INSERT` could otherwise let the insert commit against a schema that's since changed, so catalog updates get read-write conflict detection (effectively serializable) instead of the default snapshot-isolation write-write-only check. Same treatment for `FOR UPDATE`. It's a good reminder that isolation levels from the literature are a starting point, not a spec you can implement mechanically — real SQL semantics have edge cases the theory doesn't cover.

## Honest limitations, which I trust more than a paper without any

Section 8 reads like real production scar tissue rather than marketing: transactions are capped at 3,000 rows / 10MiB (deliberately, to bound tail latency via Little's Law — more concurrency in flight means worse p99s), foreign key constraints aren't supported yet (a time-to-market tradeoff they're now walking back after underestimating demand), and range partitioning — the right call for locality — makes `AUTO_INCREMENT`-style sequences and low-cardinality indexes genuinely hard to shard well. I'd rather read a systems paper that admits what doesn't work yet than one that doesn't.

## How this compares to what I'd expect from Spanner/CockroachDB

The paper's own comparison section is useful: Spanner and CockroachDB are pessimistic, with a single leader per shard and a lock table, replicated via Paxos groups. DSQL is optimistic, has no per-shard leader in the locking sense (adjudicators are stateless conflict-checkers, not lock holders), and replicates via a disaggregated Journal instead of Paxos-per-shard. The closest architectural relative they cite is actually FoundationDB, not Spanner — which tracks, since FoundationDB pioneered the "separate the transaction layer from storage entirely" idea DSQL takes even further.
