---
type: "framework"
created: "2026-10-07"
status: "active"
family: "Marketing and finance metrics"
when_to_use: "To judge whether a customer is worth what it costs to win them, and how fast the cost is paid back."
sources:
  - "Berger, P. D., Nasr, N. I. (1998). Customer Lifetime Value: Marketing Models and Applications. Journal of Interactive Marketing, 12(1)."
  - "Gupta, S., Lehmann, D. R. (2005). Managing Customers as Investments. Wharton School Publishing."
  - "Reichheld, F. F., Sasser, W. E. (1990). Zero Defections: Quality Comes to Services. Harvard Business Review, September-October."
---

# Customer Lifetime Value and CAC

**Definition:** Customer Lifetime Value (CLV or LTV) is the total profit you expect from a customer. Customer Acquisition Cost (CAC) is what you spend to win one. The ratio shows if growth pays.

## When to use / when not to
- Use them for subscription, app, retail and service businesses with repeat customers.
- Use them to set marketing budgets and prices.
- Do not use them for one-off sales with no repeat. Use [[Unit Economics]].
- Do not average very different customers together. Split by segment.

## Inputs you need
- Revenue per customer per period.
- Gross margin (after variable costs).
- Churn rate (share lost per period) or average lifetime.
- All sales and marketing cost, and the number of new customers.

## Step-by-step
1. Find monthly revenue per customer.
2. Multiply by gross margin to get monthly **gross profit** per customer.
3. Find monthly churn. Expected lifetime in months = 1 / churn.
4. **CLV** = monthly gross profit x lifetime. (Simple version. A stricter version discounts future profit.)
5. **CAC** = total sales and marketing cost / new customers in the same period.
6. **CLV : CAC ratio** = CLV / CAC. A common rule of thumb is about 3 or more.
7. **Payback period** = CAC / monthly gross profit. Shorter is safer.
8. Test sensitivity: what if churn rises or CAC doubles?

## Common pitfalls (what professors mark down)
- Using revenue, not gross profit, in CLV.
- Leaving out costs in CAC (salaries, tools, discounts).
- Using a "typical" lifetime with no churn evidence.
- Mixing periods (annual CLV with monthly CAC).
- Treating the 3:1 rule as a law.

## Worked example (synthetic)
"Fresh Box", a meal-kit subscription:
- Revenue per customer: GBP 30 a month. Gross margin: 60%.
- Monthly gross profit: 30 x 0.60 = **GBP 18**.
- Monthly churn: 5%, so lifetime = 1 / 0.05 = **20 months**.
- **CLV** = 18 x 20 = **GBP 360**.
- Marketing spend GBP 12,000; new customers 100. **CAC** = **GBP 120**.
- **CLV : CAC** = 360 / 120 = **3.0**.
- **Payback** = 120 / 18 = about **6.7 months**.

Verdict: acceptable but not strong. If churn rose to 8%, lifetime would be 12.5 months and CLV GBP 225, ratio 1.9. Churn is the key risk.

## Questions to ask yourself
- Is churn stable, or does it fall after the first months?
- Does CAC include every cost of winning a customer?
- Do some segments have much higher CLV?
- How long can we fund the payback period?

## Related frameworks
[[Unit Economics]] · [[Segmentation-Targeting-Positioning]] · [[Marketing Mix (4Ps and 7Ps)]] · [[Business Model Canvas]] · [[Discounted Cash Flow Valuation]]

## Sources
- Paul D. Berger and Nada I. Nasr, "Customer Lifetime Value: Marketing Models and Applications", *Journal of Interactive Marketing*, 1998.
- Sunil Gupta and Donald R. Lehmann, *Managing Customers as Investments*, Wharton School Publishing, 2005.
- Frederick F. Reichheld and W. Earl Sasser, "Zero Defections: Quality Comes to Services", *Harvard Business Review*, 1990.
