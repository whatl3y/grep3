import { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, UTCTimestamp, MouseEventParams, Time } from 'lightweight-charts';
import { LiquidityDistribution } from '../types';
import { formatNumber } from '../utils/api';
import './CombinedChart.css';

interface CombinedChartProps {
  data: LiquidityDistribution;
  height?: number;
  bucketPercent?: number;
}

interface LiquidityBucket {
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  percentFromCurrent: number;
  totalLiquidity: number;
  tickCount: number;
  side: 'buy' | 'sell';
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface HoveredData {
  price: number;
  bucket: LiquidityBucket | null;
  candle: CandleData | null;
  x: number;
  y: number;
}

export function CombinedChart({ data, height = 500, bucketPercent = 0.5 }: CombinedChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const liquidityCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const [hoveredData, setHoveredData] = useState<HoveredData | null>(null);

  // Process price and liquidity data
  const chartData = useMemo(() => {
    const priceDisplay = data.priceDisplay;
    const isInverted = priceDisplay?.isInverted ?? false;
    const baseSymbol = priceDisplay?.baseToken.symbol ?? data.pool.token0.symbol;
    const quoteSymbol = priceDisplay?.quoteToken.symbol ?? data.pool.token1.symbol;

    // Get current price
    let currentPrice: number;
    if (priceDisplay?.currentPriceUSD) {
      currentPrice = priceDisplay.currentPriceUSD;
    } else {
      currentPrice = isInverted
        ? parseFloat(data.pool.currentPriceInverted)
        : parseFloat(data.pool.currentPrice);
    }

    // Convert OHLC data to candlestick format
    const candlestickData: CandlestickData[] = priceDisplay?.priceHistory?.map((ohlc) => ({
      time: (ohlc.timestamp / 1000) as UTCTimestamp,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
    })) ?? [];

    // First, scan all ticks to find the actual liquidity range
    let minTickPrice = currentPrice;
    let maxTickPrice = currentPrice;
    const tickPrices: { price: number; liquidity: number }[] = [];

    for (const tick of data.ticks) {
      let tickPrice: number;
      if (isInverted) {
        tickPrice = parseFloat(tick.price1);
      } else {
        tickPrice = parseFloat(tick.price0);
      }

      // Scale tick price if we have CoinGecko price
      if (priceDisplay?.currentPriceUSD) {
        const poolCurrentPrice = isInverted
          ? parseFloat(data.pool.currentPriceInverted)
          : parseFloat(data.pool.currentPrice);
        tickPrice = (tickPrice / poolCurrentPrice) * priceDisplay.currentPriceUSD;
      }

      if (tick.liquidityUSD > 0) {
        tickPrices.push({ price: tickPrice, liquidity: tick.liquidityUSD });
        minTickPrice = Math.min(minTickPrice, tickPrice);
        maxTickPrice = Math.max(maxTickPrice, tickPrice);
      }
    }

    // Calculate display range based on candlestick data with padding
    // The chart will focus on the price action, showing liquidity only in visible range
    let minCandlePrice = currentPrice;
    let maxCandlePrice = currentPrice;
    if (candlestickData.length > 0) {
      minCandlePrice = Math.min(...candlestickData.map(c => c.low));
      maxCandlePrice = Math.max(...candlestickData.map(c => c.high));
    }

    // Add padding to candlestick range (15% on each side to show some liquidity context)
    const candleRange = maxCandlePrice - minCandlePrice;
    const padding = Math.max(candleRange * 0.15, currentPrice * 0.03);
    const minDisplayPrice = minCandlePrice - padding;
    const maxDisplayPrice = maxCandlePrice + padding;

    // Calculate bucket range based on display price range
    const minPercentFromCurrent = ((minDisplayPrice / currentPrice) - 1) * 100;
    const maxPercentFromCurrent = ((maxDisplayPrice / currentPrice) - 1) * 100;

    // Create liquidity buckets that cover the full display range
    // Use edge-to-edge (contiguous) buckets to avoid gaps
    const buckets: LiquidityBucket[] = [];
    const startBucket = Math.floor(minPercentFromCurrent / bucketPercent);
    const endBucket = Math.ceil(maxPercentFromCurrent / bucketPercent);

    for (let i = startBucket; i <= endBucket; i++) {
      // Each bucket spans from i * bucketPercent to (i + 1) * bucketPercent
      // This ensures buckets are contiguous with no gaps
      const percentLow = i * bucketPercent;
      const percentHigh = (i + 1) * bucketPercent;
      const priceLow = currentPrice * (1 + percentLow / 100);
      const priceHigh = currentPrice * (1 + percentHigh / 100);
      const percentFromCurrent = (percentLow + percentHigh) / 2; // midpoint for display

      buckets.push({
        priceLow,
        priceHigh,
        priceMid: (priceLow + priceHigh) / 2,
        percentFromCurrent,
        totalLiquidity: 0,
        tickCount: 0,
        side: percentFromCurrent < 0 ? 'buy' : 'sell',
      });
    }

    // Assign ticks to buckets
    for (const { price: tickPrice, liquidity } of tickPrices) {
      for (const bucket of buckets) {
        if (tickPrice >= bucket.priceLow && tickPrice < bucket.priceHigh) {
          bucket.totalLiquidity += liquidity;
          bucket.tickCount++;
          break;
        }
      }
    }

    // Fill gaps: for buckets with no ticks, interpolate from nearest neighbors
    // This handles the case where tick spacing doesn't align with bucket boundaries
    // In Uniswap V3, liquidity is continuous within a position's range
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].totalLiquidity === 0) {
        // Find nearest non-zero bucket below
        let belowLiquidity = 0;
        for (let j = i - 1; j >= 0; j--) {
          if (buckets[j].totalLiquidity > 0) {
            belowLiquidity = buckets[j].totalLiquidity / Math.max(buckets[j].tickCount, 1);
            break;
          }
        }
        // Find nearest non-zero bucket above
        let aboveLiquidity = 0;
        for (let j = i + 1; j < buckets.length; j++) {
          if (buckets[j].totalLiquidity > 0) {
            aboveLiquidity = buckets[j].totalLiquidity / Math.max(buckets[j].tickCount, 1);
            break;
          }
        }
        // Use the average of neighbors, or whichever is available
        if (belowLiquidity > 0 && aboveLiquidity > 0) {
          buckets[i].totalLiquidity = (belowLiquidity + aboveLiquidity) / 2;
        } else if (belowLiquidity > 0) {
          buckets[i].totalLiquidity = belowLiquidity;
        } else if (aboveLiquidity > 0) {
          buckets[i].totalLiquidity = aboveLiquidity;
        }
      }
    }

    const maxLiquidity = Math.max(...buckets.map(b => b.totalLiquidity), 1);

    // Calculate price change from candlestick data
    let priceChange = 0;
    let priceChangePercent = 0;
    let displayPrice = currentPrice;

    if (candlestickData.length >= 2) {
      const firstPrice = candlestickData[0].open;
      const lastPrice = candlestickData[candlestickData.length - 1].close;
      priceChange = lastPrice - firstPrice;
      priceChangePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
      displayPrice = lastPrice;
    } else if (candlestickData.length === 1) {
      displayPrice = candlestickData[0].close;
    }

    return {
      candlestickData,
      buckets,
      maxLiquidity,
      currentPrice: displayPrice,
      poolCurrentPrice: currentPrice,
      minDisplayPrice,
      maxDisplayPrice,
      baseSymbol,
      quoteSymbol,
      priceChange,
      priceChangePercent,
      hasPriceData: candlestickData.length > 0,
    };
  }, [data, bucketPercent]);

  // Draw liquidity bars on canvas
  const drawLiquidityBars = (
    priceToCoordinate: (price: number) => number | null,
    chartWidth: number,
    _chartHeight: number,
    visiblePriceRange?: { minPrice: number; maxPrice: number } | null
  ) => {
    const canvas = liquidityCanvasRef.current;
    const container = chartContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container with device pixel ratio
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Chart dimensions - the time scale is at bottom (~28px), price scale on right (~65px)
    const timeScaleHeight = 28;
    const priceScaleWidth = 65;
    const chartAreaWidth = chartWidth > 0 ? chartWidth : rect.width - priceScaleWidth;
    const chartAreaHeight = rect.height - timeScaleHeight;

    // Draw liquidity bars - max 25% of chart area width for better visibility
    const maxBarWidth = chartAreaWidth * 0.25;

    // Use visible price range if provided, otherwise fall back to display range
    const topPrice = visiblePriceRange?.maxPrice ?? chartData.maxDisplayPrice;
    const bottomPrice = visiblePriceRange?.minPrice ?? chartData.minDisplayPrice;
    const priceRange = topPrice - bottomPrice;

    if (priceRange <= 0) return;

    // Sort buckets by price (low to high) so we can draw them with proper overlap
    const sortedBuckets = [...chartData.buckets].sort((a, b) => a.priceLow - b.priceLow);

    for (let idx = 0; idx < sortedBuckets.length; idx++) {
      const bucket = sortedBuckets[idx];

      // Calculate Y coordinates - try priceToCoordinate first, fallback to manual calculation
      let yTop = priceToCoordinate(bucket.priceHigh);
      let yBottom = priceToCoordinate(bucket.priceLow);

      // If priceToCoordinate returns null, calculate manually based on display range
      if (yTop === null || yBottom === null) {
        // Map price to Y coordinate (Y increases downward, price increases upward)
        yTop = ((topPrice - bucket.priceHigh) / priceRange) * chartAreaHeight;
        yBottom = ((topPrice - bucket.priceLow) / priceRange) * chartAreaHeight;
      }

      // Skip if completely outside chart area
      if (yBottom < 0 || yTop > chartAreaHeight) continue;

      // Clamp to chart area
      yTop = Math.max(0, Math.min(chartAreaHeight, yTop));
      yBottom = Math.max(0, Math.min(chartAreaHeight, yBottom));

      // Calculate bar dimensions
      // Use floor/ceil to snap to pixel boundaries and extend slightly to ensure overlap
      const y = Math.floor(Math.min(yTop, yBottom));
      const yEnd = Math.ceil(Math.max(yTop, yBottom)) + 1; // +1 for overlap
      const barHeight = Math.max(yEnd - y, 2);

      const barWidth = (bucket.totalLiquidity / chartData.maxLiquidity) * maxBarWidth;

      // Only draw bars with liquidity (skip empty buckets to reduce clutter)
      if (bucket.totalLiquidity === 0) continue;

      const actualBarWidth = Math.max(barWidth, 3);

      // Draw from the right edge of chart area
      const x = chartAreaWidth - actualBarWidth;

      // Colors matching the reference image - orange for sell, gray/blue for buy
      // Using very low opacity (0.15) so candlesticks are clearly visible through bars
      if (bucket.side === 'sell') {
        // Orange/coral for sell side (above current price)
        ctx.fillStyle = 'rgba(232, 121, 87, 0.15)';
      } else {
        // Gray/blue for buy side (below current price)
        ctx.fillStyle = 'rgba(140, 160, 180, 0.15)';
      }

      ctx.fillRect(x, y, actualBarWidth, barHeight);
    }

    // Draw current price line
    let currentPriceY = priceToCoordinate(chartData.currentPrice);
    if (currentPriceY === null) {
      currentPriceY = ((topPrice - chartData.currentPrice) / priceRange) * chartAreaHeight;
    }

    if (currentPriceY !== null && currentPriceY >= 0 && currentPriceY <= chartAreaHeight) {
      ctx.strokeStyle = 'rgba(220, 80, 80, 0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentPriceY);
      ctx.lineTo(chartAreaWidth, currentPriceY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#666666',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
        scaleMargins: {
          top: 0.02,
          bottom: 0.02,
        },
      },
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#b3b3b3',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#b3b3b3',
          width: 1,
          style: 2,
        },
      },
      // Enable pinch-to-zoom and scroll on both axes
      handleScale: {
        axisPressedMouseMove: {
          time: true,  // Allow horizontal axis scaling via drag
          price: true, // Allow vertical axis scaling via drag (two-finger on trackpad)
        },
        mouseWheel: true,   // Enable mouse wheel zoom
        pinch: true,        // Enable pinch-to-zoom gesture
      },
      handleScroll: {
        mouseWheel: true,   // Allow scrolling with mouse wheel
        pressedMouseMove: true, // Allow panning by dragging
        horzTouchDrag: true,    // Allow horizontal touch drag
        vertTouchDrag: true,    // Allow vertical touch drag
      },
    });

    chartRef.current = chart;

    // Create candlestick series if we have price data
    if (chartData.hasPriceData) {
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      candlestickSeries.setData(chartData.candlestickData);
      seriesRef.current = candlestickSeries;

      // Fit content to show all candlesticks
      chart.timeScale().fitContent();

      // Enable autoScale so the chart fits the candlestick data nicely
      // Users can zoom/pan to see more liquidity
      chart.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.08,
        },
      });

    } else {
      // No price data - show a reference line at current price
      const lineSeries = chart.addLineSeries({
        color: '#1a1a1a',
        lineWidth: 1,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      const now = Math.floor(Date.now() / 1000);
      const hourAgo = now - 3600;
      lineSeries.setData([
        { time: hourAgo as UTCTimestamp, value: chartData.minDisplayPrice },
        { time: (hourAgo + 1) as UTCTimestamp, value: chartData.maxDisplayPrice },
        { time: now as UTCTimestamp, value: chartData.currentPrice },
      ]);
      seriesRef.current = lineSeries;
    }

    // Draw liquidity bars
    const updateLiquidityBars = () => {
      const timeScale = chart.timeScale();
      const chartWidth = timeScale.width();
      const chartHeight = height - 28; // Subtract time scale height

      // Get actual visible price range by probing the chart coordinates
      // This works even when the user has zoomed the price scale
      let visiblePriceRange: { minPrice: number; maxPrice: number } | null = null;

      if (seriesRef.current) {
        // Probe the top and bottom of the chart area to get the visible price range
        // Chart coordinates: Y=0 is top, Y=chartHeight is bottom (above time scale)
        const topPrice = seriesRef.current.coordinateToPrice(0);
        const bottomPrice = seriesRef.current.coordinateToPrice(chartHeight);

        if (topPrice !== null && bottomPrice !== null) {
          visiblePriceRange = {
            minPrice: Math.min(topPrice as number, bottomPrice as number),
            maxPrice: Math.max(topPrice as number, bottomPrice as number),
          };
        }
      }

      drawLiquidityBars((price: number) => {
        if (seriesRef.current) {
          return seriesRef.current.priceToCoordinate(price);
        }
        return null;
      }, chartWidth, chartHeight, visiblePriceRange);
    };

    // Initial draw with delay to allow chart to render
    setTimeout(updateLiquidityBars, 150);

    // Redraw on scale changes (time axis)
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateLiquidityBars);

    // Also listen for wheel events on the chart container to detect price scale zoom
    // This captures two-finger scroll/pinch gestures on the Y-axis
    const handleWheelOnChart = () => {
      // Debounce the update slightly to avoid too many redraws during fast scrolling
      requestAnimationFrame(updateLiquidityBars);
    };
    chartContainerRef.current?.addEventListener('wheel', handleWheelOnChart, { passive: true });

    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      updateLiquidityBars();

      if (!param.point) {
        setHoveredData(null);
        return;
      }

      // Get candlestick data at this time point
      let candle: CandleData | null = null;
      if (seriesRef.current && param.seriesData.size > 0) {
        const seriesData = param.seriesData.get(seriesRef.current);
        if (seriesData && 'open' in seriesData) {
          // It's a candlestick
          const candleSeriesData = seriesData as { time: Time; open: number; high: number; low: number; close: number };
          candle = {
            time: typeof candleSeriesData.time === 'number' ? candleSeriesData.time : 0,
            open: candleSeriesData.open,
            high: candleSeriesData.high,
            low: candleSeriesData.low,
            close: candleSeriesData.close,
          };
        }
      }

      if (seriesRef.current) {
        const price = seriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null) {
          const bucket = chartData.buckets.find(
            b => price >= b.priceLow && price < b.priceHigh
          ) ?? null;

          setHoveredData({
            price: price as number,
            bucket,
            candle,
            x: param.point.x,
            y: param.point.y,
          });
        }
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
        updateLiquidityBars();
      }
    };

    window.addEventListener('resize', handleResize);

    // Store container ref for cleanup
    const container = chartContainerRef.current;

    return () => {
      window.removeEventListener('resize', handleResize);
      container?.removeEventListener('wheel', handleWheelOnChart);
      chart.remove();
      chartRef.current = null;
    };
  }, [height, chartData]);

  const isPositive = chartData.priceChange >= 0;

  return (
    <div className="combined-chart-container">
      <div className="chart-header">
        <div className="price-info">
          <h3 className="pair-title">
            {chartData.baseSymbol}/{chartData.quoteSymbol}
          </h3>
          <div className="current-price">
            <span className="price-value">
              ${formatNumber(chartData.currentPrice)}
            </span>
            {chartData.hasPriceData && (
              <span className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
                {isPositive ? '+' : ''}{formatNumber(chartData.priceChange)} ({isPositive ? '+' : ''}{chartData.priceChangePercent.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-color buy"></span>
            <span>Buy Liquidity</span>
          </div>
          <div className="legend-item">
            <span className="legend-color sell"></span>
            <span>Sell Liquidity</span>
          </div>
        </div>
      </div>

      <div className="chart-area" style={{ height }}>
        <div ref={chartContainerRef} className="price-chart" />
        <canvas ref={liquidityCanvasRef} className="liquidity-overlay" />
      </div>

      {hoveredData && (hoveredData.candle || hoveredData.bucket) && (
        <div
          className="hover-tooltip"
          style={{
            left: Math.min(hoveredData.x + 15, window.innerWidth - 280),
            top: Math.min(hoveredData.y + 15, window.innerHeight - 250),
          }}
        >
          {/* Candlestick OHLC Data */}
          {hoveredData.candle && (
            <>
              <div className="tooltip-section-header">Price (OHLC)</div>
              <div className="tooltip-row">
                <span className="tooltip-label">Time:</span>
                <span className="tooltip-value">
                  {new Date(hoveredData.candle.time * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Open:</span>
                <span className="tooltip-value">${formatNumber(hoveredData.candle.open)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">High:</span>
                <span className="tooltip-value">${formatNumber(hoveredData.candle.high)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Low:</span>
                <span className="tooltip-value">${formatNumber(hoveredData.candle.low)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Close:</span>
                <span className={`tooltip-value ${hoveredData.candle.close >= hoveredData.candle.open ? 'positive' : 'negative'}`}>
                  ${formatNumber(hoveredData.candle.close)}
                </span>
              </div>
            </>
          )}

          {/* Liquidity Data */}
          {hoveredData.bucket && hoveredData.bucket.totalLiquidity > 0 && (
            <>
              {hoveredData.candle && <div className="tooltip-divider" />}
              <div className="tooltip-section-header">Liquidity Depth</div>
              <div className="tooltip-row">
                <span className="tooltip-label">Price Range:</span>
                <span className="tooltip-value">
                  ${formatNumber(hoveredData.bucket.priceLow)} - ${formatNumber(hoveredData.bucket.priceHigh)}
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">From Current:</span>
                <span className="tooltip-value">
                  {hoveredData.bucket.percentFromCurrent > 0 ? '+' : ''}{hoveredData.bucket.percentFromCurrent.toFixed(2)}%
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Liquidity:</span>
                <span className="tooltip-value">${formatNumber(hoveredData.bucket.totalLiquidity)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Positions:</span>
                <span className="tooltip-value">{hoveredData.bucket.tickCount}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Side:</span>
                <span className={`tooltip-value tooltip-side-${hoveredData.bucket.side}`}>
                  {hoveredData.bucket.side === 'buy' ? 'Buy (Support)' : 'Sell (Resistance)'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="chart-footer">
        <span className="data-source">
          {chartData.hasPriceData ? 'Price data from CoinGecko' : 'On-chain liquidity data'}
        </span>
        <span className="liquidity-note">
          Liquidity bars show depth at {bucketPercent}% price increments
        </span>
      </div>
    </div>
  );
}
