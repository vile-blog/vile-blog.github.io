---
title: "Paper Notes: Amazon Aurora — Design Considerations for High Throughput Cloud-Native Relational Databases"
date: 2026-09-14 10:10:00 +0700
excerpt: "Aurora's core trick is deceptively simple: stop shipping data pages over the network, ship only the redo log. My notes on how that one decision cascades into the whole architecture."
categories: [papers]
tags: ["Amazon Aurora", "Cloud Databases", "Replication", "Distributed Systems"]
paper_title: "Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"
paper_authors: "Verbitski, Gupta, Saha, Brahmadesam, Gupta, Mittal, Krishnamurthy, Maurice, Kharatishvili, Bao — SIGMOD 2017"
paper_url: "https://doi.org/10.1145/3035918.3056101"
---

*Paper: ["Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"](https://doi.org/10.1145/3035918.3056101) — Verbitski et al., SIGMOD 2017.*

I went into this paper expecting "MySQL, but on better hardware," and came out with a much better mental model for why cloud databases in general look the way they do now. The central claim of the paper is that at cloud scale, the bottleneck isn't compute or disk anymore — it's the network between the database and its storage. Everything else in the design follows from taking that seriously.

## The problem: replication amplifies writes into a network problem

The paper's setup is a synchronous, cross-AZ mirrored MySQL deployment (active instance + standby, both on networked EBS volumes). For a single application write, that configuration ends up pushing out the redo log, the binary log (for point-in-time restore), the actual modified data pages, a second copy of those pages (the "double-write" buffer, to guard against torn pages), and metadata files — and several of those writes are *sequential and synchronous*, so latency stacks up and the whole pipeline is only as fast as its slowest hop.

Aurora's answer is almost aggressively minimal: **the only thing that ever crosses the network from the database engine to storage is the redo log.** No data pages, ever — not on background writes, not on checkpoint, not on cache eviction. The framing that stuck with me: the redo log itself *is* the durable database; a materialized page is just a cache of having applied that log. Storage nodes are responsible for turning the log stream into actual pages, in the background or on demand — the engine never has to.

## Quorums sized for AZ failure, not just node failure

The other piece I hadn't seen spelled out this explicitly before: a naive 3-copy, 2-of-3 quorum looks safe until you realize that AWS's Availability Zones are *correlated* failure domains — a single AZ failure looks, from a quorum's perspective, like losing every replica inside it simultaneously, not one independent failure. If you've already got an unrelated node down elsewhere when that AZ failure hits, a 2/3 quorum can't tell if the surviving copy is current.

Aurora's response is to replicate **6 ways across 3 AZs** (2 copies per AZ) with a 4/6 write quorum and 3/6 read quorum. That specific arithmetic buys two guarantees: you can lose an entire AZ *plus* one more independent node and keep read availability, and you can lose any two nodes (including a whole AZ) and keep write availability. It's a good example of a quorum size being derived from an explicit failure model rather than picked as a round number.

They also segment storage into small (10 GB) chunks called Protection Groups, specifically to shrink **Mean Time to Repair** — a 10 GB segment can be re-replicated in about 10 seconds on a 10 Gbps link, which shrinks the window during which a second independent failure could combine with a repair-in-progress to break quorum. Durability engineering here is really MTTR engineering: you can't push MTTF (failure rate) down much further, so you attack the repair window instead.

## Async consensus instead of 2PC — the part I found most elegant

Traditional crash recovery replays the log from the last checkpoint and reasons about a single machine's disk state. Aurora doesn't have that luxury — durable state is scattered across a quorum of segments that individually might be missing arbitrary log records. Their solution avoids a chatty 2PC-style protocol entirely by leaning on the fact that log records are strictly ordered by LSN (Log Sequence Number):

- Storage nodes gossip with peers in their Protection Group to fill in gaps in the log they're missing.
- The database tracks a **Volume Complete LSN (VCL)** — the highest point below which storage can guarantee it has every record — and truncates anything past it on recovery.
- A subset of log records are tagged as **Consistency Point LSNs (CPLs)**, and the **Volume Durable LSN (VDL)** is the highest CPL at or below the VCL — this is what actually gets treated as durable, so recovery only ever truncates to a boundary the engine explicitly agreed was consistent.

This turns "did this transaction survive the crash" into a comparison of two numbers instead of a multi-round protocol, and it's why Aurora claims sub-10-second crash recovery even after 100,000+ writes/sec of load — recovery isn't replaying history, it's just re-establishing where the quorum's boundary currently sits.

## What actually moved the needle, per their own benchmarks

The headline number that justifies the whole architecture: in a SysBench write-only test, mirrored MySQL needed **7.4 I/Os per transaction** on the primary; Aurora needed **0.95** — despite Aurora replicating six ways versus MySQL's four-ish. Reducing what crosses the network beats reducing how many places it lands. The replica lag numbers make the same point from a different angle: at 10,000 writes/sec, Aurora's replicas lagged ~5.4ms behind the writer; MySQL's lagged up to 300 *seconds*, which is the kind of gap that turns into real application bugs (stale reads, replica-only queries returning nonsense) rather than just a benchmark footnote.

## Connecting this to what I'm reading next

Aurora keeps a single writer per cluster — the disaggregation is in storage, not in write coordination. That's the exact thing Aurora DSQL (my next paper note) throws out: DSQL disaggregates the *adjudication* of writes too, so there's no single-writer bottleneck at all. Reading these back to back, Aurora reads like "solve the storage network problem first," and DSQL reads like "now solve the write-coordination problem the same way."
