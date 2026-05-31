---
title: "My EDA Pipeline: Tools and Techniques for Understanding New Datasets"
description: "The repeatable process I use to profile, clean, and visualize unfamiliar datasets before building models or dashboards."
pubDate: 2026-02-01
tags: ["Data Analysis", "Python", "EDA", "Jupyter"]
minutesRead: 11
draft: false
---

Every new dataset is unfamiliar territory. The temptation is to jump straight to modeling or visualization, but that's how you build dashboards on dirty data or fit models to variables that turn out to be mislabeled.

Exploratory Data Analysis (EDA) is the step between receiving data and doing anything useful with it. This is the pipeline I run on every new dataset, roughly in this order.

## 1. First Contact: Shape and Schema

Before looking at any values, understand what you're working with.

```python
import pandas as pd

df = pd.read_csv("dataset.csv")

print(df.shape)         # (rows, cols)
print(df.dtypes)        # column types
print(df.columns.tolist())  # column names
df.head(10)             # first 10 rows
df.tail(5)              # last 5 rows
df.sample(10)           # random sample (often more representative than head)
```

`df.sample()` deserves more attention than it gets. The first rows of a dataset are often atypical — header rows that weren't stripped, test data, or ordered data where the first batch is from one time period or category. A random sample gives a better sense of what typical rows look like.

## 2. Profiling: Summary Statistics and Missing Values

```python
df.describe(include="all")
```

`describe()` with `include="all"` runs on both numeric and categorical columns. Check for:

- **Numeric columns**: min/max outliers, mean vs. median divergence (suggests skew), suspicious zeros
- **Categorical columns**: unique count, top value, frequency of top value (a column that's 95% one value is often not useful)

Then, missing values:

```python
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(1)
missing_report = pd.DataFrame({
    "missing_count": missing,
    "missing_pct": missing_pct
}).sort_values("missing_pct", ascending=False)

print(missing_report[missing_report["missing_count"] > 0])
```

Missing value patterns matter. Is data missing at random, or is there a pattern? A column missing 40% of values in Q1 but 2% the rest of the year is telling you something.

## 3. Distributions: Numeric Columns

```python
import matplotlib.pyplot as plt
import seaborn as sns

numeric_cols = df.select_dtypes(include="number").columns

fig, axes = plt.subplots(
    nrows=(len(numeric_cols) + 2) // 3,
    ncols=3,
    figsize=(15, 4 * ((len(numeric_cols) + 2) // 3))
)

for ax, col in zip(axes.flat, numeric_cols):
    df[col].dropna().hist(bins=40, ax=ax, color="steelblue", edgecolor="white")
    ax.set_title(col)
    ax.set_ylabel("Count")

plt.tight_layout()
plt.show()
```

What to look for:

- **Bimodal distributions** — may indicate two distinct populations mixed together
- **Heavy right skew** — common in revenue, session length, counts; may need log transformation
- **Values clustered at round numbers** — suggests manual data entry or bucketing
- **Impossible values** — negative ages, values outside a known valid range

## 4. Categorical Columns: Value Counts

```python
cat_cols = df.select_dtypes(include=["object", "category"]).columns

for col in cat_cols:
    print(f"\n{col} ({df[col].nunique()} unique values)")
    print(df[col].value_counts().head(10))
```

Red flags:

- **High cardinality** where you don't expect it (customer IDs in a feature column, free-text in a category field)
- **Typos and case inconsistencies** (`"USA"`, `"usa"`, `"U.S.A."` as separate values)
- **Near-duplicate categories** (`"Other"` and `"other"` and `"Unknown"`)

## 5. Correlations

```python
corr = df.select_dtypes(include="number").corr()

plt.figure(figsize=(10, 8))
sns.heatmap(
    corr,
    annot=True,
    fmt=".2f",
    cmap="coolwarm",
    center=0,
    square=True,
    linewidths=0.5
)
plt.title("Correlation Matrix")
plt.tight_layout()
plt.show()
```

High correlations between features aren't always a problem, but they're worth knowing about before modeling. Near-perfect correlation between two columns (r > 0.95) often means they're derived from each other.

## 6. Time Series Check

If there's a date column:

```python
df["date"] = pd.to_datetime(df["date_column"])
df = df.sort_values("date")

# Check date range and frequency
print(f"Range: {df['date'].min()} to {df['date'].max()}")
print(f"Rows: {len(df)}")

# Check for gaps
date_diff = df["date"].diff()
print(f"Largest gap: {date_diff.max()}")
print(f"Expected frequency: {date_diff.mode()[0]}")

# Plot row count over time to spot data density issues
df.set_index("date").resample("W").size().plot(title="Rows per week")
```

Data density changes over time are common and often meaningful — a spike in row count might indicate a data pipeline change, not real-world activity.

## 7. Outlier Investigation

Outliers deserve investigation before removal. Some are errors; some are the most interesting data points.

```python
# IQR method to flag potential outliers
for col in numeric_cols:
    Q1 = df[col].quantile(0.25)
    Q3 = df[col].quantile(0.75)
    IQR = Q3 - Q1
    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR

    outliers = df[(df[col] < lower) | (df[col] > upper)]
    if len(outliers) > 0:
        print(f"{col}: {len(outliers)} outliers ({len(outliers)/len(df)*100:.1f}%)")
        print(f"  Range outside: < {lower:.1f} or > {upper:.1f}")
```

Look at the outliers as rows, not just as statistics. Often there's a pattern — a specific time period, a specific user, a specific data source — that explains them.

## 8. Documenting Findings

EDA findings that aren't written down get forgotten. I keep a running notes cell at the top of the notebook:

```python
# === DATA QUALITY NOTES ===
# - `revenue` column: 234 nulls (3.1%), concentrated in Jan 2025 (pipeline outage)
# - `region` column: 'APAC' and 'Asia-Pacific' are the same region — need to merge
# - `user_age`: min value is 0, max is 147 — likely data entry errors, clean before use
# - `session_duration`: right-skewed, use median not mean for summaries
# - Strong correlation between `page_views` and `revenue` (r=0.81)
```

A dataset with well-documented quirks is much easier to hand off, revisit, or build on six months later.

## The Mindset

EDA is an investment that pays off in fewer model restarts, fewer dashboard corrections, and fewer "wait, why does this look wrong" conversations with stakeholders. Thirty minutes of profiling on a new dataset can save hours of confusion downstream.

The pipeline above isn't exhaustive — domain-specific datasets need domain-specific checks. But as a starting point for any tabular dataset, it covers the issues that show up most often.
