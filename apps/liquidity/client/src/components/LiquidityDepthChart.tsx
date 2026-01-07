import { useMemo, useState } from 'react';
import { LiquidityDistribution } from '../types';
import { formatNumber } from '../utils/api';
import './LiquidityDepthChart.css';

interface LiquidityDepthChartProps {
  data: LiquidityDistribution;
  height?: number;
  bucketPercent?: number; // Percentage range for each bucket (default 0.5%)
}

interface LiquidityBucket {
  priceRangeLow: number;
  priceRangeHigh: number;
  priceRangeMid: number;
  percentFromCurrent: number;
  totalLiquidity: number;
  tickCount: number;
  isCurrentPrice: boolean;
  side: 'buy' | 'sell';
}

export function LiquidityDepthChart({
  data,
  height = 400,
  bucketPercent = 0.5
}: LiquidityDepthChartProps) {
  const [hoveredBucket, setHoveredBucket] = useState<LiquidityBucket | null>(null);

  // Aggregate ticks into percentage-based buckets
  const { buckets, maxLiquidity, baseSymbol, quoteSymbol } = useMemo(() => {
    if (!data.ticks.length) {
      return { buckets: [], maxLiquidity: 0, baseSymbol: '', quoteSymbol: '' };
    }

    // Determine price display based on priceDisplay info
    const isInverted = data.priceDisplay?.isInverted ?? false;
    const baseSymbol = data.priceDisplay?.baseToken.symbol ?? data.pool.token0.symbol;
    const quoteSymbol = data.priceDisplay?.quoteToken.symbol ?? data.pool.token1.symbol;

    // Get current price (use CoinGecko price if available, otherwise pool price)
    let currentPrice: number;
    if (data.priceDisplay?.currentPriceUSD) {
      currentPrice = data.priceDisplay.currentPriceUSD;
    } else {
      currentPrice = isInverted
        ? parseFloat(data.pool.currentPriceInverted)
        : parseFloat(data.pool.currentPrice);
    }

    // Create buckets from -priceRangePercent to +priceRangePercent
    const priceRangePercent = 20; // Show +/- 20% from current price
    const numBuckets = Math.ceil((priceRangePercent * 2) / bucketPercent);
    const bucketMap = new Map<number, LiquidityBucket>();

    // Initialize buckets
    for (let i = -numBuckets / 2; i <= numBuckets / 2; i++) {
      const percentFromCurrent = i * bucketPercent;
      const priceRangeLow = currentPrice * (1 + (percentFromCurrent - bucketPercent / 2) / 100);
      const priceRangeHigh = currentPrice * (1 + (percentFromCurrent + bucketPercent / 2) / 100);

      bucketMap.set(Math.round(percentFromCurrent * 100), {
        priceRangeLow,
        priceRangeHigh,
        priceRangeMid: (priceRangeLow + priceRangeHigh) / 2,
        percentFromCurrent,
        totalLiquidity: 0,
        tickCount: 0,
        isCurrentPrice: Math.abs(percentFromCurrent) < bucketPercent / 2,
        side: percentFromCurrent < 0 ? 'buy' : 'sell',
      });
    }

    // Assign ticks to buckets
    for (const tick of data.ticks) {
      // Get price for this tick
      let tickPrice: number;
      if (isInverted) {
        tickPrice = parseFloat(tick.price1);
      } else {
        tickPrice = parseFloat(tick.price0);
      }

      // If we have CoinGecko price, scale the tick price proportionally
      if (data.priceDisplay?.currentPriceUSD) {
        const poolCurrentPrice = isInverted
          ? parseFloat(data.pool.currentPriceInverted)
          : parseFloat(data.pool.currentPrice);
        tickPrice = (tickPrice / poolCurrentPrice) * data.priceDisplay.currentPriceUSD;
      }

      // Calculate percent from current
      const percentFromCurrent = ((tickPrice / currentPrice) - 1) * 100;

      // Find the bucket
      const bucketKey = Math.round(Math.round(percentFromCurrent / bucketPercent) * bucketPercent * 100);
      const bucket = bucketMap.get(bucketKey);

      if (bucket) {
        bucket.totalLiquidity += tick.liquidityUSD;
        bucket.tickCount++;
      }
    }

    // Convert to array and sort by price (low to high for display)
    const bucketsArray = Array.from(bucketMap.values())
      .filter(b => b.totalLiquidity > 0 || b.isCurrentPrice)
      .sort((a, b) => a.priceRangeMid - b.priceRangeMid);

    const maxLiquidity = Math.max(...bucketsArray.map(b => b.totalLiquidity), 1);

    return { buckets: bucketsArray, maxLiquidity, baseSymbol, quoteSymbol };
  }, [data, bucketPercent]);

  if (buckets.length === 0) {
    return (
      <div className="liquidity-depth-container" style={{ height }}>
        <div className="no-data">No liquidity data available</div>
      </div>
    );
  }

  return (
    <div className="liquidity-depth-container">
      <div className="depth-header">
        <h3 className="depth-title">Liquidity Depth</h3>
        <div className="depth-legend">
          <div className="legend-item">
            <span className="legend-color buy"></span>
            <span>Buy Side (Below Current)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color sell"></span>
            <span>Sell Side (Above Current)</span>
          </div>
        </div>
      </div>

      <div className="depth-chart" style={{ height }}>
        <div className="price-axis">
          {buckets.filter((_, i) => i % Math.ceil(buckets.length / 10) === 0).map((bucket, i) => (
            <div key={i} className="price-label">
              ${formatNumber(bucket.priceRangeMid)}
            </div>
          ))}
        </div>

        <div className="bars-container">
          {buckets.map((bucket, index) => {
            const widthPercent = (bucket.totalLiquidity / maxLiquidity) * 100;

            return (
              <div
                key={index}
                className={`depth-bar-row ${bucket.isCurrentPrice ? 'current' : ''}`}
                onMouseEnter={() => setHoveredBucket(bucket)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                <div className="bar-price">
                  {bucket.percentFromCurrent > 0 ? '+' : ''}{bucket.percentFromCurrent.toFixed(1)}%
                </div>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${bucket.side}`}
                    style={{ width: `${Math.max(widthPercent, 0.5)}%` }}
                  />
                  {bucket.isCurrentPrice && (
                    <div className="current-price-marker">
                      <span>Current Price</span>
                    </div>
                  )}
                </div>
                <div className="bar-value">
                  ${formatNumber(bucket.totalLiquidity)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hoveredBucket && (
        <div className="depth-tooltip">
          <div className="tooltip-row">
            <span className="tooltip-label">Price Range:</span>
            <span className="tooltip-value">
              ${formatNumber(hoveredBucket.priceRangeLow)} - ${formatNumber(hoveredBucket.priceRangeHigh)}
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">From Current:</span>
            <span className="tooltip-value">
              {hoveredBucket.percentFromCurrent > 0 ? '+' : ''}{hoveredBucket.percentFromCurrent.toFixed(2)}%
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Total Liquidity:</span>
            <span className="tooltip-value">${formatNumber(hoveredBucket.totalLiquidity)}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Tick Positions:</span>
            <span className="tooltip-value">{hoveredBucket.tickCount}</span>
          </div>
        </div>
      )}

      <div className="depth-footer">
        <span className="pair-label">{baseSymbol}/{quoteSymbol}</span>
        <span className="bucket-info">Grouped by {bucketPercent}% price ranges</span>
      </div>
    </div>
  );
}
