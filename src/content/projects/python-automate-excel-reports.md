---
title: "Automating Excel Reports with Python and OpenPyXL"
description: "Stop copy-pasting into Excel. Build automated reporting pipelines that generate formatted, chart-filled workbooks from your database."
pubDate: 2026-03-05
tags: ["Data Analysis", "Python", "Automation", "Excel"]
minutesRead: 9
draft: false
---

Every data team has at least one Excel report that gets manually rebuilt every week. Someone pulls data, pastes it in, adjusts the formatting, updates the chart, and emails it out. The same hour, every Monday.

Python can do this for you. Not as a one-time export — as a repeatable pipeline that runs on a schedule and produces a formatted, chart-ready workbook ready to send.

## Why OpenPyXL

There are a few Python libraries for Excel work:

- **OpenPyXL** — reads and writes `.xlsx` files. Full control over formatting, formulas, charts, and named ranges. This is usually the right choice.
- **xlrd / xlwt** — older libraries, mostly for `.xls` (pre-2007 format). Avoid for new work.
- **pandas `to_excel()`** — uses OpenPyXL under the hood. Good for quick exports, limited formatting control.

For production reports where formatting matters, use OpenPyXL directly.

```bash
pip install openpyxl
```

## Basic Workbook Creation

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Revenue Report"

# Write data
ws["A1"] = "Month"
ws["B1"] = "Revenue"
ws["C1"] = "Orders"

data = [
    ("January", 48200, 312),
    ("February", 52100, 341),
    ("March", 61800, 398),
]

for row_idx, (month, revenue, orders) in enumerate(data, start=2):
    ws[f"A{row_idx}"] = month
    ws[f"B{row_idx}"] = revenue
    ws[f"C{row_idx}"] = orders

wb.save("revenue_report.xlsx")
```

## Formatting Headers

Raw data exports look unprofessional. A few lines of formatting make a report that people actually trust.

```python
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

def style_header_row(ws, row=1, num_cols=3):
    header_fill = PatternFill(fill_type="solid", fgColor="1F3864")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    center = Alignment(horizontal="center", vertical="center")

    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center

    ws.row_dimensions[row].height = 24

style_header_row(ws, num_cols=3)
```

## Number Formatting

Currency and percentage formatting keeps numbers readable:

```python
from openpyxl.styles import numbers

# Format column B as currency
for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=2, max_col=2):
    for cell in row:
        cell.number_format = '"$"#,##0.00'

# Format column D as percentage
for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=4, max_col=4):
    for cell in row:
        cell.number_format = "0.0%"
```

## Column Width Auto-Fit

OpenPyXL doesn't have a true auto-fit, but you can approximate it:

```python
def auto_fit_columns(ws):
    for col in ws.columns:
        max_length = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_length + 4, 40)

auto_fit_columns(ws)
```

## Adding a Bar Chart

```python
from openpyxl.chart import BarChart, Reference

chart = BarChart()
chart.type = "col"
chart.title = "Monthly Revenue"
chart.y_axis.title = "Revenue ($)"
chart.x_axis.title = "Month"
chart.style = 10
chart.width = 18
chart.height = 12

# Data reference: rows 1-4, column B (Revenue)
data_ref = Reference(ws, min_col=2, min_row=1, max_row=ws.max_row)
# Category reference: rows 2-4, column A (Month labels)
cats = Reference(ws, min_col=1, min_row=2, max_row=ws.max_row)

chart.add_data(data_ref, titles_from_data=True)
chart.set_categories(cats)

ws.add_chart(chart, "E2")
```

## Pulling Data from a Database

The full pipeline: query your database, write to Excel.

```python
import sqlalchemy
import pandas as pd
from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows

engine = sqlalchemy.create_engine("postgresql://user:pass@host/db")

query = """
  SELECT
    to_char(order_date, 'Month YYYY') AS month,
    SUM(total_amount) AS revenue,
    COUNT(*) AS orders,
    AVG(total_amount) AS avg_order_value
  FROM orders
  WHERE order_date >= NOW() - INTERVAL '12 months'
  GROUP BY date_trunc('month', order_date), to_char(order_date, 'Month YYYY')
  ORDER BY date_trunc('month', order_date)
"""

df = pd.read_sql(query, engine)

wb = Workbook()
ws = wb.active
ws.title = "Monthly Summary"

# Write DataFrame to sheet
for r in dataframe_to_rows(df, index=False, header=True):
    ws.append(r)

# Apply formatting
style_header_row(ws, num_cols=len(df.columns))
auto_fit_columns(ws)

# Format revenue column
for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=2, max_col=2):
    for cell in row:
        cell.number_format = '"$"#,##0'

wb.save("monthly_report.xlsx")
print("Report saved.")
```

## Running on a Schedule

On Linux/macOS, a cron job handles the scheduling:

```bash
# Run every Monday at 7:00 AM
0 7 * * 1 /usr/bin/python3 /home/user/reports/monthly_report.py
```

On Windows, use Task Scheduler. For a managed solution, a simple GitHub Actions workflow or a cloud function works too.

## A Note on Templates

For complex reports with existing formatting, pivot tables, or macros, a better approach is to maintain a template file and only write data into specific named ranges, leaving the formatting intact:

```python
from openpyxl import load_workbook

wb = load_workbook("template.xlsx")
ws = wb["Data"]  # write to a data sheet; a separate sheet has the formatted report
# ... write your data ...
wb.save("report_2026_03.xlsx")
```

This keeps design and data separate and makes it easy for non-Python users to update the report's layout without touching code.
