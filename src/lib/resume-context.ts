/**
 * src/lib/resume-context.ts
 *
 * The single source of truth the chatbot is grounded in. Every fact the bot
 * states must trace back to something written here. If it's not in this
 * file, the bot should not claim it.
 *
 * Keep this in sync with the real resume — if the resume changes, update
 * this file and re-run the evals (npm run evals) to make sure nothing that
 * depended on old facts silently broke.
 */

export const RESUME_CONTEXT = `
== IDENTITY ==
Name: Mohammad Ashfaq ur Rahman
Target roles: Entry-level Data Analyst or Business Analyst
Location: Khammam, Telangana, India

== PROFESSIONAL SUMMARY ==
Recent B.Tech Computer Science graduate (CGPA: 7.97/10). Skilled in Python, SQL, Power BI,
and Excel for data cleaning, exploratory data analysis (EDA), and dashboard development.
Certified in Google Analytics and Microsoft Power BI. Has project experience analyzing
datasets of 100,000+ records to generate business insights.

== TECHNICAL SKILLS ==
Programming Languages: Python (pandas, NumPy), SQL
Data Visualization & BI Tools: Power BI, Microsoft Excel
Data Analysis: Data Cleaning, Exploratory Data Analysis (EDA), Data Transformation, Business Analytics
Tools & Platforms: Jupyter Notebook, VS Code, Google Analytics
Web Technologies: HTML, CSS, JavaScript
Core Competencies: Dashboard Development, Data-Driven Decision Making, Business Insight Generation

Note: Ashfaq does NOT have listed experience with React, Vue, backend frameworks, or
languages other than Python and SQL. The portfolio website itself (Astro/TypeScript/
Cloudflare Workers) was built as a personal project, separate from his data-analytics
skill set above — do not present web-development frameworks as part of his analytics skillset.

== CERTIFICATIONS ==
- Google Analytics Certification — Google — Issued November 2025, valid through November 2026
- Get Started Building with Power BI — Microsoft Learn — February 2025
- 1-Month Internship Certification in Python Programming — VaultofCodes.in — October 2025

== DATA ANALYTICS PROJECTS ==
1. Superstore Sales Analysis
   - Analyzed 10,000+ sales records using Python and Power BI
   - Identified the Technology category as the top contributor (~40% of total profit)
   - Built an interactive dashboard to deliver actionable business insights to stakeholders

2. NYC Taxi Data Dashboard
   - Processed 100,000+ rows of taxi trip data
   - Identified peak demand hours (5 PM - 8 PM) to support operational planning
   - Discovered a ~20% increase in weekend ride volume compared to weekdays

3. HR Attrition Analysis
   - Conducted EDA on employee data
   - Calculated an attrition rate of ~16%
   - Identified low salary and limited experience as key attrition drivers
   - Presented data-driven findings to support employee retention strategy recommendations

== INTERNSHIP EXPERIENCE (no full-time jobs held) ==
1. Data Analytics Virtual Internship — Tata Group (via Forage)
   - Worked with real-world business datasets to perform data analysis, build dashboards,
     and generate business recommendations

2. Python Programming Internship — VaultofCodes.in — October 2025
   - Completed a 1-month hands-on internship in Python programming, building foundational
     skills supporting data analysis project work

Ashfaq has NOT held any full-time job. He has not worked at any company as an employee
(including Google, Microsoft, or any other company) — only the two internships above,
plus the certifications listed (a certification is not employment).

== EDUCATION ==
- B.Tech, Computer Science and Engineering — Swarna Bharati Institute of Science and
  Technology, Khammam — Completed 2022-2026 — Final CGPA: 7.97/10
  (Ashfaq has GRADUATED with this degree. He is a recent graduate, not a current student —
  never describe him as "currently studying," "currently enrolled," or "expected to graduate."
  The degree is finished and the 7.97/10 is his final CGPA.)
- Intermediate (12th Grade) — Sri Chaitanya Junior College, Khammam — 849/1000
- SSC (10th Grade) — Oxford High School, Khammam — GPA: 10/10

== KEY ACHIEVEMENTS ==
- Built 3+ real-world data analytics projects using Python, SQL, and Power BI
- Analyzed datasets exceeding 100,000 rows to generate measurable business insights
- Earned analytics and BI certifications from Google and Microsoft

== SOFT SKILLS ==
Analytical Thinking, Problem Solving, Communication, Fast Learner, Attention to Detail

== PUBLIC CONTACT (already published on the site's Contact page — fine to share) ==
LinkedIn: linkedin.com/in/ashfaq-ur-rahman
GitHub: github.com/ashfaq8121
The site's Contact page and footer are the right place to direct anyone who wants to
reach Ashfaq directly — point people there rather than reciting phone numbers or
personal email addresses verbatim in chat.

== OUT OF SCOPE — DO NOT ANSWER FROM MEMORY OR GUESS ==
- Exact home address (only the city/state above is known — never invent a street address)
- Age, date of birth, family details, religion, or any other personal information not above
- Salary expectations or compensation numbers (politely decline; suggest discussing directly)
- Any skill, tool, employer, or job title not explicitly listed above
`.trim();