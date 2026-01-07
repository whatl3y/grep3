import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { LiquidityDistribution } from '../types';
import { formatNumber } from '../utils/api';
import './PriceChart.css';

interface PriceChartProps {
  data: LiquidityDistribution;
  height?: number;
}

export function PriceChart({ data, height = 300 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Get price display info
  const priceInfo = useMemo(() => {
    if (!data.priceDisplay) {
      return null;
    }

    const { baseToken, quoteToken, currentPriceUSD, priceHistory } = data.priceDisplay;

    // Convert OHLC data to candlestick format
    const candlestickData: CandlestickData[] = priceHistory.map((ohlc) => ({
      time: (ohlc.timestamp / 1000) as UTCTimestamp, // Convert ms to seconds
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
    }));

    // Calculate price change
    let priceChange = 0;
    let priceChangePercent = 0;
    if (candlestickData.length >= 2) {
      const firstPrice = candlestickData[0].open;
      const lastPrice = candlestickData[candlestickData.length - 1].close;
      priceChange = lastPrice - firstPrice;
      priceChangePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    return {
      baseToken,
      quoteToken,
      currentPriceUSD,
      candlestickData,
      priceChange,
      priceChangePercent,
    };
  }, [data.priceDisplay]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || !priceInfo || priceInfo.candlestickData.length === 0) {
      return;
    }

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
    });

    chartRef.current = chart;

    // Create candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#2d8f5e',
      downColor: '#dc2626',
      borderUpColor: '#2d8f5e',
      borderDownColor: '#dc2626',
      wickUpColor: '#2d8f5e',
      wickDownColor: '#dc2626',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    candlestickSeries.setData(priceInfo.candlestickData);

    // Add current price line
    candlestickSeries.createPriceLine({
      price: priceInfo.currentPriceUSD,
      color: '#1a1a1a',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'Current',
    });

    // Fit content
    chart.timeScale().fitContent();

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
  }, [height, priceInfo]);

  if (!priceInfo || priceInfo.candlestickData.length === 0) {
    return (
      <div className="price-chart-container">
        <div className="no-price-data">
          <span>Price history not available for this token pair</span>
        </div>
      </div>
    );
  }

  const isPositive = priceInfo.priceChange >= 0;

  return (
    <div className="price-chart-container">
      <div className="price-header">
        <div className="price-info">
          <h3 className="price-title">
            {priceInfo.baseToken.symbol}/{priceInfo.quoteToken.symbol}
          </h3>
          <div className="current-price">
            <span className="price-value">
              ${formatNumber(priceInfo.currentPriceUSD)}
            </span>
            <span className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? '+' : ''}{formatNumber(priceInfo.priceChange)} ({isPositive ? '+' : ''}{priceInfo.priceChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="price-meta">
          <span className="quote-label">
            Price in {priceInfo.quoteToken.isStable ? priceInfo.quoteToken.symbol : 'USD'}
          </span>
        </div>
      </div>

      <div ref={chartContainerRef} className="chart-wrapper" />
    </div>
  );
}
