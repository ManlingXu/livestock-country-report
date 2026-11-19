(() => {
  "use strict";

  const seriesColors = ["#176b57", "#a6581d", "#385d9f"];
  const compactNumber = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumSignificantDigits: 3,
  });

  function formatTick(value) {
    if (Math.abs(value) < 1e-9 && value !== 0) return value.toExponential(1);
    return compactNumber.format(value);
  }

  function tickLabels(ticks) {
    const labels = ticks.map(formatTick);
    if (new Set(labels).size === ticks.length) return labels;
    const precise = new Intl.NumberFormat("en", { maximumSignificantDigits: 7 });
    return ticks.map((tick) => precise.format(tick));
  }

  function numericScale(values) {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = minimum === maximum
      ? (Math.abs(maximum) || 1) * 0.15
      : (maximum - minimum) * 0.12;
    const lower = minimum >= 0 ? Math.max(0, minimum - padding) : minimum - padding;
    const upper = maximum <= 0 && minimum < 0 ? Math.min(0, maximum + padding) : maximum + padding;
    const targetStep = (upper - lower) / 5;
    const magnitude = 10 ** Math.floor(Math.log10(targetStep));
    const multiplier = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= targetStep);
    const step = multiplier * magnitude;
    const firstTick = Math.floor(lower / step);
    const lastTick = Math.ceil(upper / step);
    const ticks = Array.from({ length: lastTick - firstTick + 1 }, (_, index) =>
      (firstTick + index) * step,
    );
    return { lower: ticks[0], upper: ticks.at(-1), ticks };
  }

  function drawSeries(ctx, series, years, xAt, yAt, pointRadius) {
    series.forEach(({ color, values }, index) => {
      ctx.strokeStyle = color || seriesColors[index];
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      let connected = false;
      years.forEach((_, yearIndex) => {
        const value = values[yearIndex];
        if (!Number.isFinite(value)) {
          connected = false;
        } else if (connected) {
          ctx.lineTo(xAt(yearIndex), yAt(value));
        } else {
          ctx.moveTo(xAt(yearIndex), yAt(value));
          connected = true;
        }
      });
      ctx.stroke();

      years.forEach((_, yearIndex) => {
        const value = values[yearIndex];
        if (!Number.isFinite(value)) return;
        ctx.beginPath();
        ctx.arc(xAt(yearIndex), yAt(value), pointRadius, 0, 2 * Math.PI);
        ctx.fill();
      });
    });
  }

  function drawExportHeader(ctx, section, series, width) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#19352e";
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillText(section.title, 48, 34, width - 96);

    ctx.fillStyle = "#566963";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText(section.unit, 48, 65, width - 96);
    ctx.font = "600 16px system-ui, sans-serif";
    let legendX = 48;
    for (const [index, item] of series.entries()) {
      ctx.fillStyle = item.color || seriesColors[index];
      ctx.fillRect(legendX, 88, 16, 4);
      ctx.fillStyle = "#304740";
      ctx.fillText(item.name, legendX + 23, 90);
      legendX += ctx.measureText(item.name).width + 43;
    }
  }

  function renderCountryChart(canvas, section, options = {}) {
    const exporting = Boolean(options.export);
    const parentWidth = canvas.parentElement?.clientWidth;
    const width = Math.max(160, options.width || parentWidth || 640);
    const height = options.height || (width < 480 ? 218 : 260);
    const pixelRatio = exporting ? 1 : Math.min(window.devicePixelRatio || 1, 3);
    const years = section.years;
    const series = section.series.slice(0, 3);
    const values = series.flatMap((line) => line.values.slice(0, years.length))
      .filter(Number.isFinite);

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    if (!exporting) {
      canvas.style.width = "100%";
      canvas.style.height = height + "px";
      canvas.style.display = "block";
      if (!canvas.hasAttribute("aria-label")) {
        canvas.setAttribute("aria-label", section.title + " line chart. See the data table for exact values.");
        canvas.setAttribute("role", "img");
      }
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (exporting) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      drawExportHeader(ctx, section, series, width);
      if (section.source) {
        ctx.fillStyle = "#566963";
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillText(section.source, 48, height - 15, width - 96);
      }
    }

    if (!years.length || !values.length) {
      ctx.fillStyle = "#566963";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No data for this selection", width / 2, height / 2, width - 16);
      return canvas;
    }

    const scale = numericScale(values);
    const fontSize = exporting ? 16 : 12;
    ctx.font = fontSize + "px system-ui, sans-serif";
    const labels = tickLabels(scale.ticks);
    const labelWidth = Math.max(...labels.map((label) => ctx.measureText(label).width));
    const left = (exporting ? 48 : 0) + labelWidth + 12;
    const right = width - (exporting ? 48 : 20);
    const top = exporting ? 122 : 12;
    const bottom = height - (exporting ? (section.source ? 67 : 45) : 28);
    const xAt = (index) => years.length === 1
      ? (left + right) / 2
      : left + index / (years.length - 1) * (right - left);
    const yAt = (value) => bottom - (value - scale.lower) / (scale.upper - scale.lower) * (bottom - top);

    ctx.fillStyle = "#566963";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e0e8e4";
    for (const [index, tick] of scale.ticks.entries()) {
      const y = yAt(tick);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillText(labels[index], left - 9, y);
    }

    ctx.textAlign = "center";
    const labelCount = Math.min(years.length, Math.max(2, Math.floor((right - left) / (exporting ? 95 : 62))));
    for (let i = 0; i < labelCount; i += 1) {
      const index = labelCount === 1 ? 0 : Math.round(i * (years.length - 1) / (labelCount - 1));
      ctx.fillText(years[index], xAt(index), bottom + (exporting ? 23 : 16));
    }

    ctx.lineWidth = exporting ? 3.4 : 2.5;
    drawSeries(ctx, series, years, xAt, yAt, exporting ? 4.6 : 3);
    return canvas;
  }

  async function countryChartPng(section) {
    const canvas = document.createElement("canvas");
    renderCountryChart(canvas, section, { width: 1200, height: 540, export: true });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((image) => image ? resolve(image) : reject(new Error("Chart image could not be exported")), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  window.renderCountryChart = renderCountryChart;
  window.countryChartPng = countryChartPng;
})();

