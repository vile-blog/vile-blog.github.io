---
title: "Paper Notes: What Goes Around Comes Around... And Around"
date: 2026-09-14 10:05:00 +0700
excerpt: "Stonebraker & Pavlo's 20-years-later sequel argues every NoSQL rebellion eventually grows back into SQL. My notes on why, and what actually changed instead."
categories: [papers]
tags: ["Database Systems", "NoSQL", "NewSQL", "Database History"]
paper_title: "What Goes Around Comes Around... And Around"
paper_authors: "Michael Stonebraker, Andrew Pavlo — SIGMOD Record, Vol. 53, No. 2, June 2024"
paper_url: "https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf"
---

*Paper: ["What Goes Around Comes Around... And Around"](https://db.cs.cmu.edu/papers/2024/whatgoesaround-sigmodrec2024.pdf) — Michael Stonebraker & Andrew Pavlo, SIGMOD Record, June 2024. A 20-years-later sequel to Stonebraker & Hellerstein's 2005 "What Goes Around Comes Around".*

This one is less a systems paper and more a 20-year retrospective, and I read it as a map of every database trend I've heard people get excited about — MapReduce, NoSQL, NewSQL, vector databases, blockchain DBs — with a single question applied to each: *did it replace the relational model, or did it just get absorbed by it?*

## The pattern, stated up front

The authors' thesis is blunt: every category that set out to replace SQL/the relational model has instead either (a) died off, (b) shrunk into a niche, or (c) grown a SQL interface and drifted back toward looking like an RDBMS. They walk eight data models (MapReduce, key-value, document, column-family, text search, array, vector, graph) through this lens, and the same shape shows up over and over.

A few examples that made the pattern click for me:

- **MapReduce/Hadoop** — pitched as the schema-free alternative to data warehouses, it's now essentially dead; even Google moved its own crawl pipeline off MapReduce in 2010 and killed it internally by 2014. What survived (Spark, Flink) survived by *adding* SQL support, not by staying procedural.
- **Document databases (MongoDB et al.)** — "NoSQL" originally meant "SQL and joins are slow, don't use them" and "transactions are unnecessary." By 2021 MongoDB had added both SQL-ish querying and ACID transactions. The paper's line is that the differences between document and relational systems "should become nearly indistinguishable in the future."
- **Column-family stores (BigTable, Cassandra, HBase)** — copied BigTable's no-joins, no-secondary-indexes design, then spent the next decade adding SQL-like fronts (CQL, Phoenix) back on top.
- **Vector databases** — the current hype category, and the paper predicts the same arc: they're "essentially document-oriented DBMSs with specialized ANN indexes," and RDBMSs added `pgvector`-style extensions within about a year of ChatGPT's release. The specialized index is a feature, the authors argue, not a reason for a whole new system.

The throughline: developers keep rejecting SQL for being slow or rigid, then the *query language* comes back because record-at-a-time APIs don't compose and don't optimize, and the *data model* comes back because ad-hoc denormalized nesting reintroduces the exact 1970s join/redundancy problems relational normalization was invented to solve.

## What genuinely *did* change: architecture, not data model

The more interesting half of the paper, for me, is the second part, where the authors concede that while the relational *model* barely moved, the *implementations* changed enormously — and this is where I think the real engineering lessons are:

- **Columnar storage** took over the entire data warehouse market because it compresses better (single value type per block) and lets a vectorized engine process a whole column at once instead of a row at a time.
- **Cloud / disaggregated storage** — separating compute from storage over the network (rather than direct-attached disk) enables per-query elasticity and reassigning idle compute. The authors call this "what goes around comes around" too: shared-disk architectures were historically considered a bad idea, and they're back because networking got fast enough to make the tradeoff work.
- **Data lakes / lakehouses** — replacing the "load data into the DBMS's proprietary format" model with open file formats (Parquet, ORC, Iceberg) that any engine can read, because ML workflows live in Python dataframes, not SQL clients.
- **NewSQL** never had the uptake people expected — not because the idea was wrong, but because OLTP is the part of the stack companies are most risk-averse about touching. An OLAP failure inconveniences an analyst; an OLTP failure stops revenue.

## The line that stuck with me

> "Never underestimate the value of good marketing for bad products."

The paper's parting advice reads like hard-won scar tissue: watch for DBMSs that started as an internal tool at a company with no DBMS expertise (their examples: several Apache projects that began as in-house tools before being open-sourced); don't ignore the "out-of-box experience" that made DuckDB and Python notebooks popular over "create a database, then define your tables" friction; and be skeptical of new query languages, because the actual bottleneck in adopting them was never syntax, it was the query optimizer, and optimizers take decades to mature.

## Why I filed this as a "papers" note and not just a link

Reading this alongside the Aurora and Aurora DSQL papers I'm also working through was useful: this survey is basically the "why" for the architecture choices those papers make. Aurora and DSQL don't reinvent the relational model or SQL — they're aggressively conventional on that front (DSQL literally embeds PostgreSQL's query engine). What they innovate on is exactly the "system architecture" bucket this paper calls out: disaggregating storage from compute, and rethinking replication for the cloud. That's a useful lens to carry into the next two notes.
