import { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, HistogramData, LineData, UTCTimestamp, MouseEventParams, Time } from 'lightweight-charts';
import { LiquidityDistribution, TickData } from '../types';
import { formatNumber, formatPrice } from '../utils/api';
import './LiquidityChart.css';

interface LiquidityChartProps {
  data: LiquidityDistribution;
  height?: number;
}

interface HoveredTick {
  tick: TickData;
  x: number;
  y: number;
}

export function LiquidityChart({ data, height = 500 }: LiquidityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const liquiditySeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [hoveredTick, setHoveredTick] = useState<HoveredTick | null>(null);

  // Process tick data for the chart
  const chartData = useMemo(() => {
    if (!data.ticks.length) return { liquidity: [], priceLine: [] };

    // Sort ticks by price
    const sortedTicks = [...data.ticks].sort(
      (a, b) => parseFloat(a.price0) - parseFloat(b.price0)
    );

    // Find max liquidity for normalization
    const maxLiquidity = Math.max(...sortedTicks.map((t) => t.liquidityUSD));

    // Create histogram data - use price as time (synthetic)
    const liquidityData: HistogramData[] = sortedTicks.map((tick, index) => {
      const price = parseFloat(tick.price0);
      const currentPrice = parseFloat(data.pool.currentPrice);
      const isAboveCurrent = price >= currentPrice;

      return {
        time: index as UTCTimestamp,
        value: tick.liquidityUSD,
        color: isAboveCurrent
          ? 'rgba(220, 38, 38, 0.55)' // Red for above current price (sell pressure)
          : 'rgba(45, 143, 94, 0.65)', // Green for below current price (buy pressure)
      };
    });

    // Create price line data
    const priceLineData: LineData[] = sortedTicks.map((tick, index) => ({
      time: index as UTCTimestamp,
      value: parseFloat(tick.price0),
    }));

    return {
      liquidity: liquidityData,
      priceLine: priceLineData,
      ticks: sortedTicks,
      maxLiquidity,
    };
  }, [data]);

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
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#e0e0e0',
        visible: false, // Hide time scale as we're using synthetic indices
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
    });

    chartRef.current = chart;

    // Create liquidity histogram series
    const liquiditySeries = chart.addHistogramSeries({
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatNumber(price),
      },
      priceScaleId: 'left',
    });
    liquiditySeriesRef.current = liquiditySeries;

    // Create price line series
    const priceLineSeries = chart.addLineSeries({
      color: '#1a1a1a',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatPrice(price),
      },
      priceScaleId: 'right',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });
    priceLineSeriesRef.current = priceLineSeries;

    // Configure left price scale for liquidity
    chart.priceScale('left').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  // Update chart data
  useEffect(() => {
    if (!liquiditySeriesRef.current || !priceLineSeriesRef.current) return;

    liquiditySeriesRef.current.setData(chartData.liquidity);
    priceLineSeriesRef.current.setData(chartData.priceLine);

    // Add current price marker
    if (data.pool.currentPrice) {
      const currentPriceValue = parseFloat(data.pool.currentPrice);
      priceLineSeriesRef.current.createPriceLine({
        price: currentPriceValue,
        color: '#1a1a1a',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Current',
      });
    }
  }, [chartData, data.pool.currentPrice]);

  // Handle crosshair move for tooltip
  useEffect(() => {
    if (!chartRef.current) return;

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined) {
        setHoveredTick(null);
        return;
      }

      const index = param.time as number;
      if (chartData.ticks && chartData.ticks[index]) {
        setHoveredTick({
          tick: chartData.ticks[index],
          x: param.point.x,
          y: param.point.y,
        });
      }
    };

    chartRef.current.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      if (chartRef.current) {
        chartRef.current.unsubscribeCrosshairMove(handleCrosshairMove);
      }
    };
  }, [chartData.ticks]);

  return (
    <div className="liquidity-chart-container">
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-color buy"></span>
          <span>Buy Liquidity (Below Current Price)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color sell"></span>
          <span>Sell Liquidity (Above Current Price)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color price"></span>
          <span>Price Curve</span>
        </div>
      </div>

      <div ref={chartContainerRef} className="chart-wrapper" />

      {hoveredTick && (
        <div
          className="tick-tooltip"
          style={{
            left: Math.min(hoveredTick.x + 10, window.innerWidth - 250),
            top: hoveredTick.y + 10,
          }}
        >
          <div className="tooltip-row">
            <span className="tooltip-label">Price:</span>
            <span className="tooltip-value">
              {formatPrice(hoveredTick.tick.price0)} {data.pool.token1.symbol}/{data.pool.token0.symbol}
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Liquidity:</span>
            <span className="tooltip-value">${formatNumber(hoveredTick.tick.liquidityUSD)}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Tick:</span>
            <span className="tooltip-value">{hoveredTick.tick.tick}</span>
          </div>
        </div>
      )}
    </div>
  );
}
