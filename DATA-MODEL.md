# DATA-MODEL.md

## Table: contact_submissions

| Column       | Type    | Constraints                         |
|--------------|---------|-------------------------------------|
| id           | INTEGER | PRIMARY KEY, AUTOINCREMENT          |
| name         | TEXT    | NOT NULL                            |
| email        | TEXT    | NOT NULL                            |
| message      | TEXT    | NOT NULL                            |
| ip           | TEXT    | nullable, stored for abuse tracking |
| submitted_at | TEXT    | NOT NULL, defaults to datetime('now')|
| is_deleted   | INTEGER | NOT NULL, default 0 (soft-delete)   |

## Validation Rules
- name: required, 2–100 characters, HTML tags stripped server-side
- email: required, valid email format, max 254 characters
- message: required, 10–4000 characters, HTML tags stripped server-side

## Concurrency
SQLite (D1) serialises writes. Two simultaneous submissions queue safely —
no duplicate rows or data corruption possible.

## Schema Reproducibility
Run `wrangler d1 migrations apply portfolio-db` to recreate from scratch.
Migration file: migrations/0001_init.sql