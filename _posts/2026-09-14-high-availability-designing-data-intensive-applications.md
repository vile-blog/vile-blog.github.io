---
title: "High Availability in Designing Data-Intensive Applications"
date: 2026-09-14 10:00:00 +0700
excerpt: "My notes on how DDIA frames high availability — replication, failover, and why 'available' and 'consistent' keep pulling in opposite directions."
categories: [book-notes]
tags: ["Designing Data-Intensive Applications", "Replication", "Fault Tolerance", "Distributed Systems"]
book_title: "Designing Data-Intensive Applications"
book_author: "Martin Kleppmann"
book_url: "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/"
---

*Book: [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/) by Martin Kleppmann — chapters on Replication, and Distributed System Troubles / Consistency & Consensus.*

I've been going through DDIA slowly, and the chapters on replication and consensus finally connected a bunch of things I'd been treating as separate concerns: "why do we replicate data", "what happens when a node dies", and "why is consistency so hard to get for free". Here's how I'm holding it together in my head.

## Availability starts with a boring question: what fails?

Kleppmann's framing that stuck with me is that a "failure" isn't a single category of event — it's a spectrum of blast radii and durations: a process crashing, a slow network link that isn't quite down, a node that's up but unreachable from some other nodes (partial failure), a whole datacenter losing power. A system that only handles clean crash-and-restart will still fall over the first time it meets a partial failure, because from the outside a slow node and a dead node look identical until a timeout fires.

That's the real job of "high availability": not preventing failures — you can't — but designing so that when *some* of these things happen, the rest of the system can still make progress. Which immediately means: no single node can be the only copy of anything, and no single node can be the only thing capable of accepting writes indefinitely.

## Replication is the mechanism, but the topology matters

DDIA walks through three replication topologies, and what I found useful wasn't the mechanics of each but *why* you'd pick one:

- **Single-leader** — one node accepts writes, replicates to followers. Simple to reason about, but the leader is a single point of failure for writes, and you need a failover process the moment it dies.
- **Multi-leader** — several nodes accept writes and replicate to each other. Useful across datacenters (each region writes locally), but now you've bought yourself write conflicts that someone — the app or the database — has to resolve.
- **Leaderless** — any node can accept a read or write, and the client (or a coordinator) talks to several replicas and reconciles using quorums (Dynamo-style `Vw + Vr > V`). No leader to fail over, but you trade that for read-repair, hinted handoff, and reasoning about staleness per-request instead of per-node.

The pattern I keep noticing: every topology just relocates the hard problem. Single-leader moves it to "how do we fail over safely". Multi-leader moves it to "how do we merge conflicting writes". Leaderless moves it to "how does the client know it read a consistent-enough view".

## Failover is where the theory meets the mess

This was the part of the chapter that felt most like real engineering rather than distributed-systems trivia. A single-leader failover sounds simple — leader dies, promote a follower, done — but every step has a sharp edge:

1. **Detecting the leader is actually dead**, not just slow or partitioned, usually via a timeout. Too short and you get spurious failovers under load; too long and you have a longer outage than necessary.
2. **Picking the new leader**, ideally the most up-to-date replica, which needs some kind of election protocol (this is where the book leans into Chapter 9's consensus material — you can't safely elect a leader without something like a majority vote).
3. **Reconfiguring clients and other replicas** to point at the new leader.

And the failure modes here are the interesting bit: if the old leader comes back and doesn't realize it's been demoted, you get **split brain** — two nodes both think they're the leader and both accept writes, and now you have two histories to reconcile. If the failover discards writes the old leader had accepted but not yet replicated, clients can lose data they were told was durable. Kleppmann's blunt conclusion is that there's genuinely no failover timeout that's both safe and fast; you're choosing a point on that tradeoff, not eliminating it.

## Replication lag turns "available" into "available, but weird"

Even once failover works, asynchronous replication (which you need for availability and performance) means followers lag behind the leader. That lag is invisible until an application does something like: write a comment, then immediately reload the page and read from a follower that hasn't caught up yet — and the comment is gone. DDIA names the specific guarantees you might want here:

- **Read-your-writes** — a user should always see their own writes, even if reads generally go to a lagging replica.
- **Monotonic reads** — once you've seen a value, you shouldn't later see an older one (which can otherwise happen if consecutive reads land on different replicas).
- **Consistent prefix reads** — if writes happened in a causal order, reads shouldn't see them out of order.

None of these are free — each is a specific promise you have to engineer for (routing a user's reads to the leader after they write, sticky sessions, tracking a causality token) — and each one you skip is a specific, reproducible bug waiting for a user to find it.

## Where this connects to consensus

The thread that ties the whole thing together: safe leader election, safe failover, and avoiding split-brain all reduce to **consensus** — getting a set of nodes to agree on one value (in this case, "who is the leader") even when some of them might be slow, crashed, or partitioned. That's why the replication chapter keeps gesturing forward at Raft/Paxos-style protocols instead of solving leader election itself. High availability isn't really a separate topic from consensus — it's consensus applied to the one question that matters most operationally: *who gets to accept writes right now*.

## What I'm taking away

The biggest shift in how I think about "HA" after this: it's not a checkbox you get from adding replicas. It's a set of very specific tradeoffs — timeout lengths, which consistency guarantees you promise the application, how you detect and resolve conflicting writes — that have to be chosen deliberately, because the failure-free case was never the hard part.

Next up in my notes: probably Chapter 9's actual consensus algorithms, since I keep hand-waving at them here.
