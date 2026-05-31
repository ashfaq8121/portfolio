---
title: "Ethical Web Scraping: A Developer's Guide to Respecting Robots.txt"
description: "Beyond the code: understanding rate limits, terms of service, and building scrapers that won't get you (or your IP) banned."
pubDate: 2026-04-30
tags: ["Web Dev", "Python", "Scraping", "Ethics"]
minutesRead: 6
draft: false
---

Most scraping tutorials teach you how to extract data. Few of them talk about whether you should, and how to do it without being a bad actor on the web. This post is about the other half.

## Start with robots.txt

Every well-maintained site has a `robots.txt` file at its root (e.g., `https://example.com/robots.txt`). It's a plain-text file that tells automated agents which paths they're allowed to crawl and at what speed.

```
User-agent: *
Disallow: /admin/
Disallow: /user/
Crawl-delay: 5

User-agent: Googlebot
Allow: /
```

Reading `robots.txt` before you write a single line of scraping code is the starting point for ethical scraping. Python's `urllib.robotparser` makes this easy:

```python
from urllib.robotparser import RobotFileParser

rp = RobotFileParser()
rp.set_url("https://example.com/robots.txt")
rp.read()

if rp.can_fetch("*", "https://example.com/products"):
    # safe to scrape
    pass
else:
    print("Disallowed by robots.txt")
```

Note that `robots.txt` is a convention, not a legal enforcement mechanism. But ignoring it is a signal to site operators that your bot is acting in bad faith.

## Check the Terms of Service

`robots.txt` governs automated access technically. Terms of service (ToS) govern it legally. Many sites explicitly prohibit scraping in their ToS, even for public pages. This matters if:

- The data is commercially valuable
- You plan to republish or sell the data
- The site is based in a jurisdiction with strong data protection laws

If you're unsure, the safe path is to reach out to the site owner or look for an official API. Many sites that have interesting data also offer developer access precisely because they'd prefer controlled API usage over scrapers.

## Rate Limiting: Don't Be a Flood

Sending 500 requests per second to a small website is effectively a DDoS attack. Even if you don't intend harm, you can take down a site or rack up significant server costs for someone else.

Practical rate limiting in Python:

```python
import time
import random
import requests

def scrape_page(url):
    response = requests.get(url, headers={"User-Agent": "MyResearchBot/1.0"})
    response.raise_for_status()
    return response.text

urls = ["https://example.com/page/1", "https://example.com/page/2"]

for url in urls:
    content = scrape_page(url)
    # process content...

    # Respect crawl-delay or use a reasonable default
    delay = random.uniform(2, 5)  # randomize to avoid pattern detection
    time.sleep(delay)
```

A delay of 2–5 seconds between requests is generally reasonable for small sites. For larger sites, check `Crawl-delay` in their `robots.txt`.

## Identify Your Bot

Masquerading as a browser is a red flag. Setting a descriptive `User-Agent` header is a basic courtesy that lets site operators understand who's accessing their data and contact you if needed.

```python
headers = {
    "User-Agent": "DataResearchBot/1.0 (+https://yoursite.com/bot-info)"
}
```

A contact URL in your User-Agent string is optional but genuinely appreciated by site operators.

## Cache Aggressively

Hitting the same page multiple times wastes bandwidth and increases your footprint. Cache responses to disk so you only fetch each page once per run — or once ever for static content.

```python
import os
import hashlib

def cached_fetch(url):
    cache_key = hashlib.md5(url.encode()).hexdigest()
    cache_path = f"cache/{cache_key}.html"

    if os.path.exists(cache_path):
        with open(cache_path) as f:
            return f.read()

    response = requests.get(url, headers={"User-Agent": "MyBot/1.0"})
    os.makedirs("cache", exist_ok=True)
    with open(cache_path, "w") as f:
        f.write(response.text)

    return response.text
```

## When You Get Blocked

If a site blocks your scraper, the ethical response is to stop — not to rotate proxies and try harder. Being blocked is a signal that the site operator does not want automated access. Continuing anyway is not a grey area.

If you genuinely need the data, reach out and explain your use case. Many site operators will grant access for research or provide an export.

## A Short Checklist

Before running any scraper:

- [ ] Read and respect `robots.txt`
- [ ] Review the site's terms of service
- [ ] Set a descriptive `User-Agent` with contact info
- [ ] Implement rate limiting (2–5 seconds minimum for small sites)
- [ ] Cache responses to avoid repeat fetches
- [ ] Consider whether an official API exists
- [ ] Ask yourself whether you'd be comfortable if the site owner saw what you were doing

Ethical scraping isn't just about avoiding getting banned. It's about treating the web as a shared resource that depends on mutual respect between operators and consumers.
