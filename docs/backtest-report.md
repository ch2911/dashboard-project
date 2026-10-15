# Forecast backtest

This is the report from the [Forecast backtest](https://github.com/ch2911/dashboard-project/actions/runs/38750009869) workflow, run on 15 October 2026 against `main` at aeacbad. It was made by `scripts/backtest_forecast.py`, which downloads five years of daily prices for the stocks in `backend/stocks.json` from Yahoo Finance and forecasts each one 1 to 7 trading days ahead over the last two years. Every forecast only uses prices up to the day it was made. Three of the 66 stocks (BRK.B, BARC and LLOY) had no price data, so 63 were tested.

"ARIMA (current)" is the ARIMA(10,1,0) model the dashboard used before this backtest. Because it did worse than assuming the price stays the same, the dashboard now shows "No change": today's price carried forward, with a likely range sized from the last six months of daily moves.

To run it again, start the "Forecast backtest" workflow from the Actions tab. The report appears on the run's summary page.

---

# Forecast backtest

63 stocks, forecasting from 100 days between 2024-10-11 and 2026-10-05, 1 to 7 trading days ahead (44,100 forecasts per model). Took 2.4 minutes.

## Overall

Lower is better for both errors. "In range" should be close to 80%.

| Model | Middle-line error | Range score | In range | Range width | Right direction |
|---|---|---|---|---|---|
| No change | 2.849% | 0.9365 | 81.6% | ±4.79% | n/a |
| No change, recent volatility | 2.849% | 0.9378 | 80.8% | ±4.74% | n/a |
| ARIMA (current) | 2.952% | 0.9729 | 77.0% | ±4.49% | 49.4% |
| Trees (new) | 2.867% | 0.9431 | 74.9% | ±3.98% | 50.6% |

Middle-line error is the average gap between the forecast and the real price, as a % of the price. Range score (pinball loss) rewards ranges that are narrow but still contain the real price.

## Compared with "no change"

Negative means better than assuming the price stays the same. The 95% interval comes from resampling the forecast days; if it includes 0, the difference could be luck.

| Model | Middle-line error | Range score |
|---|---|---|
| No change, recent volatility | +0.00% (+0.00% to +0.00%) | +0.14% (-0.49% to +0.75%) |
| ARIMA (current) | +3.64% (+2.86% to +4.45%) | +3.88% (+2.99% to +4.74%) |
| Trees (new) | +0.63% (-0.77% to +1.98%) | +0.71% (-0.82% to +2.16%) |

## Compared with the current ARIMA

| Model | Middle-line error | Range score |
|---|---|---|
| No change | -3.51% (-4.26% to -2.78%) | -3.74% (-4.52% to -2.90%) |
| No change, recent volatility | -3.51% (-4.26% to -2.78%) | -3.61% (-4.42% to -2.81%) |
| Trees (new) | -2.90% (-4.46% to -1.46%) | -3.06% (-4.71% to -1.54%) |

## Middle-line error by horizon

| Days ahead | No change | No change, recent volatility | ARIMA (current) | Trees (new) |
|---|---|---|---|---|
| 1 | 1.378% | 1.378% | 1.446% | 1.410% |
| 2 | 2.044% | 2.044% | 2.148% | 2.073% |
| 3 | 2.561% | 2.561% | 2.658% | 2.585% |
| 4 | 3.046% | 3.046% | 3.166% | 3.046% |
| 5 | 3.366% | 3.366% | 3.495% | 3.372% |
| 6 | 3.671% | 3.671% | 3.786% | 3.670% |
| 7 | 3.874% | 3.874% | 3.967% | 3.910% |

## Verdict

Best range score: No change.
- vs No change, recent volatility: -0.14% (-0.75% to +0.49%), not clearly better
- vs ARIMA (current): -3.74% (-4.52% to -2.90%), clearly better
- vs Trees (new): -0.70% (-2.12% to +0.83%), not clearly better
