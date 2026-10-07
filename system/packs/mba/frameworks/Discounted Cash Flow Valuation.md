---
type: "framework"
created: "2026-10-07"
status: "active"
family: "Finance: valuation"
when_to_use: "To estimate what a business or project is worth today from the cash it is expected to produce in future."
sources:
  - "Williams, J. B. (1938). The Theory of Investment Value. Harvard University Press."
  - "Koller, T., Goedhart, M., Wessels, D. (McKinsey and Company). Valuation: Measuring and Managing the Value of Companies. Wiley. (7th edition 2020.)"
  - "Damodaran, A. Investment Valuation. Wiley. (Many editions.)"
---

# Discounted Cash Flow Valuation

**Definition:** A pound received later is worth less than a pound today. DCF adds up all future free cash flows, each discounted back to today, to give the value of the business.

## When to use / when not to
- Use it to value a company, project or acquisition with forecastable cash flows.
- Use it to see which assumptions drive value.
- Do not use it for very early firms with no reliable forecast, without scenarios.
- Do not present one number as exact. DCF gives a range.

## Inputs you need
- Forecast of **free cash flow** (cash available to all investors) for 5 to 10 years.
- A discount rate, usually [[WACC]].
- A long-term growth rate for the end value.
- Net debt (debt minus cash) and number of shares.

## Step-by-step
1. Forecast revenue, margins, tax, investment and working capital for each year.
2. Compute free cash flow for each year.
3. Choose the discount rate (WACC).
4. Discount each year: PV = cash flow / (1 + r)^t.
5. Compute the **terminal value** at the end of the forecast: TV = final cash flow x (1 + g) / (r - g). Growth g must be below the long-run economy.
6. Discount the terminal value back to today.
7. **Enterprise value** = sum of PVs + PV of terminal value.
8. **Equity value** = enterprise value - net debt. Per share = equity value / shares.
9. Run sensitivities on WACC and g. Cross-check with [[Valuation by Multiples]].

## Common pitfalls (what professors mark down)
- Terminal value is most of the value, and nobody mentions it.
- Growth rate higher than the economy, or equal to the discount rate.
- Discounting equity cash flows at WACC (or the reverse).
- Forgetting to subtract net debt.
- Optimistic forecasts with no link to the market.

## Worked example (synthetic)
"Delta Foods" (GBP million). Free cash flow: year 1 = 100, 2 = 110, 3 = 120, 4 = 130, 5 = 140. WACC 10%. Terminal growth 2%.
- Present value of years 1 to 5 = **447.7**.
- Terminal value = 140 x 1.02 / (0.10 - 0.02) = **1,785**. Discounted over 5 years = **1,108.3**.
- **Enterprise value** = 447.7 + 1,108.3 = **1,556.0**.
- Net debt 200, so **equity value** = **1,356.0**. With 100 million shares, about **GBP 13.56 per share**.
- The terminal value is 71% of enterprise value.
- Sensitivity: at WACC 9% the value per share is about 15.86; at 11% it is about 11.77.

## Questions to ask yourself
- What share of value comes from the terminal value?
- Which assumption moves the answer most?
- Is the forecast consistent with industry growth and margins?
- What would a buyer pay today?

## Related frameworks
[[WACC]] · [[Valuation by Multiples]] · [[Unit Economics]] · [[Customer Lifetime Value and CAC]] · [[BCG Growth-Share Matrix]]

## Sources
- John Burr Williams, *The Theory of Investment Value*, Harvard University Press, 1938.
- Koller, Goedhart and Wessels, *Valuation*, Wiley (7th edition 2020).
- Aswath Damodaran, *Investment Valuation*, Wiley (many editions).
