---
type: "framework"
created: "2026-10-07"
status: "active"
family: "Finance: cost of capital"
when_to_use: "To find the average return a firm must earn to satisfy its investors, used as the discount rate in a DCF."
sources:
  - "Modigliani, F., Miller, M. H. (1958). The Cost of Capital, Corporation Finance and the Theory of Investment. American Economic Review, 48(3)."
  - "Modigliani, F., Miller, M. H. (1963). Corporate Income Taxes and the Cost of Capital: A Correction. American Economic Review, 53(3)."
  - "Sharpe, W. F. (1964). Capital Asset Prices: A Theory of Market Equilibrium under Conditions of Risk. Journal of Finance, 19(3)."
  - "Lintner, J. (1965). The Valuation of Risk Assets and the Selection of Risky Investments in Stock Portfolios and Capital Budgets. Review of Economics and Statistics, 47(1)."
---

# WACC

**Definition:** Weighted Average Cost of Capital. The blended cost of the money a firm uses: equity (owners) and debt (lenders), weighted by how much of each it has.

## When to use / when not to
- Use it as the discount rate for the cash flows of the whole firm in a [[Discounted Cash Flow Valuation]].
- Use it as the minimum return for projects with the firm's usual risk.
- Do not use one WACC for projects with very different risk.
- Do not use book values for the weights. Use market values.

## Inputs you need
- Market value of equity and of debt.
- Risk-free rate, equity risk premium, and the firm's beta.
- Pre-tax cost of debt and the tax rate.

## Step-by-step
1. Find the market value of equity (E) and debt (D). Total V = E + D.
2. Weights: E / V and D / V.
3. **Cost of equity** by CAPM: Ke = risk-free rate + beta x equity risk premium.
4. **Cost of debt** after tax: Kd x (1 - tax rate). Interest is tax-deductible.
5. **WACC** = (E / V) x Ke + (D / V) x Kd x (1 - tax).
6. Check it makes sense against peers and the country.
7. Test a range (for example 0.5 points either side).

## Common pitfalls (what professors mark down)
- Using book value of equity.
- Forgetting the tax shield on debt.
- Using the coupon on old debt as the cost of debt, not today's market rate.
- Using a beta from a very different firm without adjusting for debt.
- Reporting WACC with false precision (6.9132%).

## Worked example (synthetic)
- Equity GBP 600m, debt GBP 400m. V = 1,000. Weights: **60%** equity, **40%** debt.
- Risk-free 3%, beta 1.2, equity risk premium 5%. **Ke = 3% + 1.2 x 5% = 9%**.
- Pre-tax cost of debt 5%, tax 25%. **After-tax Kd = 5% x 0.75 = 3.75%**.
- **WACC = 0.60 x 9% + 0.40 x 3.75% = 5.4% + 1.5% = 6.9%**.
Use about 7%, and show a range of 6.5% to 7.5%.

## Questions to ask yourself
- Are the weights at market value and at a target mix?
- Is the beta suitable for this business?
- Is the risk-free rate in the same currency as the cash flows?
- How sensitive is my valuation to a 1 point change?

## Related frameworks
[[Discounted Cash Flow Valuation]] · [[Valuation by Multiples]] · [[Unit Economics]] · [[Customer Lifetime Value and CAC]] · [[Business Model Canvas]]

## Sources
- Modigliani and Miller, "The Cost of Capital, Corporation Finance and the Theory of Investment", *American Economic Review*, 1958.
- Modigliani and Miller, "Corporate Income Taxes and the Cost of Capital: A Correction", *American Economic Review*, 1963.
- William F. Sharpe, "Capital Asset Prices", *Journal of Finance*, 1964.
- John Lintner, "The Valuation of Risk Assets and the Selection of Risky Investments in Stock Portfolios and Capital Budgets", *Review of Economics and Statistics*, 1965.
