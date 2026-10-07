---
type: "framework"
created: "2026-10-07"
status: "active"
family: "Finance: valuation"
when_to_use: "To value a firm quickly by comparing it with similar listed firms or recent deals."
sources:
  - "Liu, J., Nissim, D., Thomas, J. (2002). Equity Valuation Using Multiples. Journal of Accounting Research, 40(1)."
  - "Koller, T., Goedhart, M., Wessels, D. (McKinsey and Company). Valuation: Measuring and Managing the Value of Companies. Wiley."
  - "Damodaran, A. Investment Valuation. Wiley. (Relative valuation chapters.)"
---

# Valuation by Multiples

**Definition:** Value a firm by applying the price that the market pays for similar firms, such as "9 times EBITDA", to the firm's own numbers.

## When to use / when not to
- Use it as a fast check on a [[Discounted Cash Flow Valuation]].
- Use it when good comparable firms or deals exist.
- Do not use it when peers are very different in size, growth or risk.
- Do not use it as the only method. Markets can be too high or too low together.

## Inputs you need
- A list of comparable firms (same industry, size, growth, region).
- Their market values, net debt and financial figures (EBITDA, earnings, sales).
- The target firm's financials, on the same basis.

## Step-by-step
1. Choose 4 to 8 truly comparable firms. State why.
2. Pick the right multiple:
   - **EV/EBITDA** or **EV/Sales** (enterprise value, before debt effects).
   - **P/E** (price per share / earnings per share, equity only).
3. Compute each peer's multiple using the same period (for example, next year).
4. Use the **median** (less affected by outliers), and show the range.
5. Apply the multiple to the target's matching figure to get a value.
6. If you used an enterprise multiple, subtract net debt to get equity value.
7. Adjust for differences (growth, margin, risk). Explain them.
8. Compare with the DCF and explain gaps.

## Common pitfalls (what professors mark down)
- Peers that are not comparable.
- Mixing enterprise multiples with equity figures (EV with earnings, or P/E with EBITDA).
- Using a mean that includes one wild outlier.
- Different periods or accounting bases.
- Skipping the net debt step.

## Worked example (synthetic)
Target: "Delta Foods", EBITDA GBP 50m, net debt GBP 100m, 70m shares.
Peer EV/EBITDA multiples: 8.0x, 9.0x, 10.0x, 9.0x. **Median 9.0x**.
- **Enterprise value** = 9.0 x 50 = **GBP 450m**.
- **Equity value** = 450 - 100 = **GBP 350m**.
- **Per share** = 350 / 70 = **GBP 5.00**.
- Range: 8.0x gives EV 400, equity 300, GBP 4.29 a share. 10.0x gives EV 500, equity 400, GBP 5.71 a share.

## Questions to ask yourself
- Why are these peers truly similar?
- Does the target grow faster or slower than they do?
- Does the multiple match the figure (EV with EV, equity with equity)?
- Is the whole sector over- or under-priced right now?

## Related frameworks
[[Discounted Cash Flow Valuation]] · [[WACC]] · [[Unit Economics]] · [[BCG Growth-Share Matrix]] · [[Porter's Five Forces]]

## Sources
- Jing Liu, Doron Nissim and Jacob Thomas, "Equity Valuation Using Multiples", *Journal of Accounting Research*, 2002.
- Koller, Goedhart and Wessels, *Valuation*, Wiley.
- Aswath Damodaran, *Investment Valuation*, Wiley.
