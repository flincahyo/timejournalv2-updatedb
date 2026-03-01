"use client";
import React, { useEffect, useRef, memo } from 'react';

function TradingViewWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Prevent double injection in React strict mode
    if (container.current && container.current.querySelector('script')) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `{
      "autosize": true,
      "symbol": "OANDA:XAUUSD",
      "interval": "5",
      "timezone": "Asia/Jakarta",
      "theme": "light",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "backgroundColor": "#FCFCFC",
      "gridColor": "rgba(0, 0, 0, 0)",
      "toolbar_bg": "#FCFCFC",
      "overrides": {
        "paneProperties.background": "#FCFCFC",
        "paneProperties.vertGridProperties.color": "rgba(0, 0, 0, 0)",
        "paneProperties.horzGridProperties.color": "rgba(0, 0, 0, 0)"
      },
      "studies": [
        "STD;RSI"
      ],
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "hide_volume": true,
      "details": true,
      "hotlist": true,
      "calendar": true,
      "hide_side_toolbar": false,
      "allow_symbol_change": true,
      "watchlist": [
        "OANDA:XAUUSD",
        "OANDA:EURUSD",
        "OANDA:GBPUSD",
        "OANDA:USDJPY",
        "NASDAQ:AAPL",
        "NASDAQ:NVDA",
        "NASDAQ:MSFT",
        "BLACKBULL:US30",
        "BLACKBULL:SPX500",
        "BLACKBULL:NAS100",
        "BINANCE:BTCUSD",
        "BINANCE:ETHUSD"
      ],
      "withdateranges": false,
      "support_host": "https://www.tradingview.com"
    }`;

    container.current?.appendChild(script);
  }, []);

  return (
    <div className="p-4 md:p-7 h-auto lg:h-[calc(100vh-60px)] flex flex-col gap-4 pb-20 md:pb-7">
      <style dangerouslySetInnerHTML={{
        __html: `
        .tradingview-widget-container { background: #FCFCFC !important; }
        .tradingview-widget-container iframe { background: #FCFCFC !important; }
      `}} />
      <div className="flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-text tracking-[-0.8px] leading-tight mb-1">
            Market Watchlist
          </h1>
          <p className="text-[12px] font-semibold text-text3 tracking-[.04em]">
            Advanced charting and symbol tracking by TradingView
          </p>
        </div>
      </div>

      <div className="w-full flex-1 min-h-[500px] lg:min-h-0 overflow-hidden p-0 relative bg-surface flex items-center justify-center rounded-[20px]">
        <div className="tradingview-widget-container absolute inset-0 w-full h-full" ref={container}>
          <div className="tradingview-widget-container__widget w-full h-full" style={{ height: "calc(100% - 32px)" }}></div>
        </div>
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);
