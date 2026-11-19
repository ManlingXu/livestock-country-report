"use strict";

(() => {
  const config = window.COUNTRY_REPORT_CONFIG;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const colors = ["#176b57", "#a6581d", "#385d9f", "#7c5aa6", "#bd8a13"];
  const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" });
  const apiCache = new Map();
  const dom = {};
  let loadedBundle = null;
  let activeReport = null;
  let renderedReportId = "";
  let bundleRevision = 0;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function link(label, url, className = "inline-link") {
    const element = node("a", className, label);
    element.href = url;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
    return element;
  }

  function setStatus(message, kind = "") {
    if (!dom.status) return;
    dom.status.textContent = message;
    dom.status.dataset.kind = kind;
    dom.status.classList.toggle("error", kind === "error");
  }

  function setExportStatus(message) {
    if (dom.exportStatus) dom.exportStatus.textContent = message;
  }

  function clearRenderedReport() {
    renderedReportId = "";
    if (dom.summary) { dom.summary.hidden = true; dom.summary.replaceChildren(); }
    dom.charts?.replaceChildren();
    dom.sources?.replaceChildren();
    dom.reportNavigation?.replaceChildren();
    if (dom.exportCsv) dom.exportCsv.disabled = true;
    if (dom.exportJson) dom.exportJson.disabled = true;
    if (dom.printReport) dom.printReport.disabled = true;
    if (dom.exportWord) dom.exportWord.disabled = true;
    setExportStatus("");
  }

  function setStep(step) {
    const names = { 1: "context", 2: "modules", 3: "review", 4: "analysis", 5: "report" };
    const activeName = names[step] || step;
    $$('[data-panel]').forEach((panel) => {
      const active = panel.dataset.panel === activeName;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    $$('[data-step]').forEach((indicator) => {
      const order = { context: 1, modules: 2, review: 3, analysis: 4, report: 5 };
      const indicatorStep = order[indicator.dataset.step];
      const activeStep = order[activeName];
      indicator.classList.toggle("is-active", indicator.dataset.step === activeName);
      indicator.classList.toggle("is-complete", indicatorStep < activeStep);
      indicator.setAttribute("aria-current", indicator.dataset.step === activeName ? "step" : "false");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addOption(select, value, label, selected = false) {
    const option = node("option", "", label);
    option.value = value;
    option.selected = selected;
    select.append(option);
  }

  function populateControls() {
    dom.country.replaceChildren();
    dom.comparison.replaceChildren();
    dom.comparison2.replaceChildren();
    dom.species.replaceChildren();
    dom.purpose.replaceChildren();
    dom.depth.replaceChildren();
    dom.emphasis.replaceChildren();
    dom.startYear.replaceChildren();
    dom.endYear.replaceChildren();
    config.countries.forEach((country) => {
      const label = `${country.flag || ""} ${country.name}`.trim();
      addOption(dom.country, country.id, label, country.id === "GHA");
      addOption(dom.comparison, country.id, label);
      addOption(dom.comparison2, country.id, label);
    });
    const empty = node("option", "", "No peer country");
    const empty2 = node("option", "", "No second peer country");
    empty.value = "";
    empty2.value = "";
    dom.comparison.prepend(empty);
    dom.comparison2.prepend(empty2);
    dom.comparison.value = "";
    dom.comparison2.value = "";
    config.species.forEach((species) => addOption(dom.species, species.id, species.label));
    (config.purposes || [
      { id: "country-overview", label: "Country overview" },
      { id: "policy-dialogue", label: "Policy dialogue" },
      { id: "programme-design", label: "Programme design" },
      { id: "investment-scoping", label: "Investment scoping" },
      { id: "risk-monitoring", label: "Risk monitoring" },
    ]).forEach((item, index) => addOption(dom.purpose, item.id, item.label, index === 0));
    (config.depths || [
      { id: "snapshot", label: "Snapshot brief" },
      { id: "standard", label: "Standard report" },
      { id: "full", label: "Full evidence pack" },
    ]).forEach((item) => addOption(dom.depth, item.id, item.label, item.id === "standard"));
    (config.emphases || [
      { id: "balanced", label: "Balanced" },
      { id: "production", label: "Production & productivity" },
      { id: "one-health", label: "One Health" },
      { id: "climate", label: "Climate & environment" },
    ]).forEach((item, index) => addOption(dom.emphasis, item.id, item.label, index === 0));
    for (let year = config.years.max; year >= config.years.min; year -= 1) {
      addOption(dom.startYear, String(year), String(year), year === config.years.defaultStart);
      addOption(dom.endYear, String(year), String(year), year === config.years.defaultEnd);
    }
  }

  function renderModuleOptions() {
    dom.moduleOptions.replaceChildren();
    for (const module of config.modules) {
      const card = node("article", "module-card");
      card.dataset.module = module.id;
      const label = node("label", "module-toggle");
      const input = node("input");
      input.type = "checkbox";
      input.name = "modules";
      input.value = module.id;
      input.checked = module.default;
      const body = node("span", "module-card-body");
      body.append(node("span", "module-card-title", module.label));
      body.append(node("span", "module-card-short", module.short));
      body.append(node("span", "module-card-description", module.description));
      label.append(input, body);
      const details = node("details", "indicator-picker");
      details.open = Boolean(module.default);
      details.append(node("summary", "", `${module.indicators?.length || 0} available indicators`));
      const list = node("div", "indicator-list");
      for (const indicator of module.indicators || []) {
        const indicatorLabel = node("label", "indicator-option");
        const indicatorInput = node("input");
        indicatorInput.type = "checkbox";
        indicatorInput.name = "indicators";
        indicatorInput.value = indicator.id;
        indicatorInput.dataset.module = module.id;
        indicatorInput.checked = Boolean(module.default && indicator.default !== false);
        const copy = node("span");
        copy.append(node("strong", "", indicator.label), node("small", "", `${indicator.unit} · ${indicator.evidenceType}`));
        indicatorLabel.append(indicatorInput, copy);
        list.append(indicatorLabel);
      }
      details.append(list);
      card.append(label, details);
      dom.moduleOptions.append(card);
    }
  }

  function selectedContext() {
    const country = config.countries.find((item) => item.id === dom.country.value);
    const comparison = config.countries.find((item) => item.id === dom.comparison.value) || null;
    const comparison2 = config.countries.find((item) => item.id === dom.comparison2.value) || null;
    const comparisons = [comparison, comparison2].filter(Boolean);
    const species = config.species.find((item) => item.id === dom.species.value) || config.species[0];
    const modules = $$('input[name="modules"]:checked').map((input) => input.value);
    const indicators = $$('input[name="indicators"]:checked').filter((input) => modules.includes(input.dataset.module)).map((input) => input.value);
    const purpose = (config.purposes || []).find((item) => item.id === dom.purpose.value) || { id: dom.purpose.value, label: dom.purpose.selectedOptions[0]?.textContent || "Country overview" };
    const depth = (config.depths || []).find((item) => item.id === dom.depth.value) || { id: dom.depth.value, label: dom.depth.selectedOptions[0]?.textContent || "Standard profile", maxFindings: 7, includeAppendix: true };
    const emphasis = (config.emphases || []).find((item) => item.id === dom.emphasis.value) || { id: dom.emphasis.value, label: dom.emphasis.selectedOptions[0]?.textContent || "Balanced", priorityModules: [] };
    return { country, comparison, comparison2, comparisons, species, purpose, depth, emphasis, modules, indicators, start: Number(dom.startYear.value), end: Number(dom.endYear.value) };
  }

  function updateBlueprint() {
    const selection = selectedContext();
    const selectedModules = config.modules.filter((module) => selection.modules.includes(module.id));
    $("#blueprint-country").textContent = selection.country?.name || "Not selected";
    $("#blueprint-comparison").textContent = selection.comparisons.length ? selection.comparisons.map((item) => item.name).join(", ") : "None";
    $("#blueprint-period").textContent = selection.start && selection.end ? `${selection.start}–${selection.end}` : "—";
    $("#blueprint-species").textContent = selection.species?.label || "All livestock";
    $("#blueprint-modules").textContent = selectedModules.length ? `${selectedModules.length} modules · ${selection.indicators.length} indicators` : "Not selected";
    if ($("#blueprint-purpose")) $("#blueprint-purpose").textContent = selection.purpose.label;
    if ($("#blueprint-depth")) $("#blueprint-depth").textContent = selection.depth.label;
    $("#module-count").textContent = `${selectedModules.length} modules · ${selection.indicators.length} indicators`;
    $("#blueprint-coverage").textContent = loadedBundle ? "Data review available" : "Ready to check coverage";
    $$('input[name="modules"]').forEach((input) => input.closest(".module-card")?.classList.toggle("is-selected", input.checked));
  }

  function validateContext(selection, requireModules = false) {
    if (!selection.country) return "Choose a country.";
    const ids = [selection.country, ...selection.comparisons].map((item) => item.id);
    if (new Set(ids).size !== ids.length) return "Choose different countries for the primary and peer selections.";
    if (selection.start > selection.end) return "The start year must be before the end year.";
    if (requireModules && !selection.modules.length) return "Select at least one report module.";
    if (requireModules && !selection.indicators.length) return "Select at least one indicator.";
    if (requireModules && selection.modules.some((moduleId) => {
      const module = config.modules.find((item) => item.id === moduleId);
      return !(module?.indicators || []).some((indicator) => selection.indicators.includes(indicator.id));
    })) return "Each selected module needs at least one indicator.";
    return "";
  }

  const normalisedM49 = (country) => String(Number(country.m49));

  function apiUrl(params) {
    const url = new URL(config.apiBase);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    });
    return url;
  }

  async function fetchHub(params) {
    const url = apiUrl(params);
    if (apiCache.has(url.href)) return apiCache.get(url.href);
    const promise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Hub API returned ${response.status}`);
        const payload = await response.json();
        return { ok: true, data: Array.isArray(payload) ? payload : [], url: url.href };
      } catch (error) {
        return { ok: false, data: [], error: error.name === "AbortError" ? "Request timed out" : error.message, url: url.href };
      } finally {
        clearTimeout(timeout);
      }
    })();
    apiCache.set(url.href, promise);
    promise.then((result) => { if (!result.ok) apiCache.delete(url.href); });
    return promise;
  }

  async function loadPopulation(country, selection) {
    const common = { location: normalisedM49(country), from_date: selection.start, to_date: selection.end };
    const [livestock, poultry] = await Promise.all([
      fetchHub({ key: "livestockTimeseries", ...common }),
      fetchHub({ key: "poultryTimeseries", ...common }),
    ]);
    return { livestock, poultry };
  }

  async function loadGenetics(country) {
    const location = country.id;
    const [breeds, adaptedness, risk, material] = await Promise.all([
      fetchHub({ key: "species", location }),
      fetchHub({ key: "adaptedness", location }),
      fetchHub({ key: "numberOfSpeciesAtRiskOfExtinctionExcludingUnknown", location }),
      fetchHub({ key: "geneticMaterialForSpecies", location, type: "2.5.1" }),
    ]);
    return { breeds, adaptedness, risk, material };
  }

  const loadProduction = async (country) => ({ primary: await fetchHub({ key: "primary_production", location: normalisedM49(country) }) });

  async function loadHealth(country, selection) {
    const healthAliases = {
      "China, mainland": "China",
      "Bolivia (Plurinational State of)": "Bolivia",
      "Iran (Islamic Republic of)": "Iran",
      "Lao People's Democratic Republic": "Lao PDR",
      "Republic of Moldova": "Moldova",
      "Russian Federation": "Russia",
      "Syrian Arab Republic": "Syria",
      "Türkiye": "Turkey",
      "United Republic of Tanzania": "Tanzania",
      "Venezuela (Bolivarian Republic of)": "Venezuela",
    };
    const common = {
      location: healthAliases[country.name] || country.name,
      start_date: `${selection.start}-01-01`,
      end_date: `${selection.end}-12-31`,
      disease: "all",
      diagnosis_status: "Confirmed",
      animal_type: "all",
    };
    const [events, seasonality, referenceCentres] = await Promise.all([
      fetchHub({ key: "diseases_timeseries", ...common }),
      fetchHub({ key: "diseases_seasonality", ...common }),
      fetchHub({ key: "reference_centres", location: country.name }),
    ]);
    return { events, seasonality, referenceCentres };
  }

  async function loadClimate(country, selection) {
    const location = normalisedM49(country);
    const climateEnd = Math.min(selection.end, 2023);
    const trend = climateEnd >= selection.start
      ? fetchHub({ key: "emissions_timeseries_by_species", location, from_date: selection.start, to_date: climateEnd, gas: "CH4" })
      : Promise.resolve({ ok: true, data: [], url: apiUrl({ key: "emissions_timeseries_by_species", location }).href });
    const [timeseries, intensity, gas, commodity] = await Promise.all([
      trend,
      fetchHub({ key: "emission_intensities_by_species", location, year: 2023 }),
      fetchHub({ key: "emissions_by_gas", location, year: 2023 }),
      fetchHub({ key: "emissions_by_commodity", location: country.id }),
    ]);
    return { timeseries, intensity, gas, commodity };
  }

  async function loadCountry(country, selection) {
    const tasks = selection.modules.map(async (moduleId) => {
      if (moduleId === "population") return [moduleId, await loadPopulation(country, selection)];
      if (moduleId === "genetics") return [moduleId, await loadGenetics(country)];
      if (moduleId === "production") return [moduleId, await loadProduction(country)];
      if (moduleId === "health") return [moduleId, await loadHealth(country, selection)];
      if (moduleId === "climate") return [moduleId, await loadClimate(country, selection)];
      return [moduleId, { local: true }];
    });
    return { country, modules: Object.fromEntries(await Promise.all(tasks)) };
  }

  async function loadSelection(selection) {
    setStatus("Retrieving selected modules from the Livestock Hub…", "loading");
    activeReport = null;
    clearRenderedReport();
    dom.analysisDashboard.replaceChildren();
    dom.analysisSignals.replaceChildren();
    dom.analysisGaps.replaceChildren();
    dom.analysisDialogue.replaceChildren();
    dom.nextModules.disabled = true;
    dom.buildAnalysis.disabled = true;
    dom.generate.disabled = true;
    dom.review.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span><strong>Loading live Hub data</strong><span>Checking coverage, years and sources before the report is generated.</span></div>';
    try {
      const countries = [selection.country, ...selection.comparisons].filter(Boolean);
      const results = await Promise.all(countries.map((country) => loadCountry(country, selection)));
      const bundle = { id: `bundle-${++bundleRevision}`, selection, countries: results, accessedAt: new Date() };
      loadedBundle = bundle;
      updateBlueprint();
      renderReview(bundle);
      setStatus("Data review is ready. Check coverage before generating the report.", "success");
      return bundle;
    } finally {
      dom.nextModules.disabled = false;
      dom.buildAnalysis.disabled = false;
      dom.generate.disabled = false;
    }
  }

  const allResponses = (moduleData) => Object.values(moduleData || {}).filter((value) => value && typeof value === "object" && "ok" in value);
  const recordCount = (moduleData) => allResponses(moduleData).reduce((sum, response) => sum + response.data.length, 0);

  function yearRange(moduleData) {
    const years = allResponses(moduleData).flatMap((response) => response.data.flatMap((row) => {
      const directText = row.year ?? String(row.date || "").slice(0, 4);
      const direct = directText === "" || directText == null ? Number.NaN : Number(directText);
      const benchmark = Object.keys(row).filter((key) => /^y\d{4}$/.test(key)).map((key) => Number(key.slice(1)));
      return [direct, ...benchmark].filter(Number.isFinite);
    }));
    return years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "Snapshot / links";
  }

  function selectedIndicatorModels(selection) {
    return selection.modules.flatMap((moduleId) => {
      const module = config.modules.find((item) => item.id === moduleId);
      return (module?.indicators || []).filter((indicator) => selection.indicators.includes(indicator.id)).map((indicator) => ({ module, indicator }));
    });
  }

  function responseForIndicator(entry, module, indicator) {
    const data = entry.modules[module.id] || {};
    const responseMap = {
      livestockTimeseries: data.livestock,
      poultryTimeseries: data.poultry,
      species: data.breeds,
      adaptedness: data.adaptedness,
      numberOfSpeciesAtRiskOfExtinctionExcludingUnknown: data.risk,
      geneticMaterialForSpecies: data.material,
      primary_production: data.primary,
      diseases_timeseries: data.events,
      top_5_diseases: data.events,
      diseases_seasonality: data.seasonality,
      reference_centres: data.referenceCentres,
      emissions_timeseries_by_species: data.timeseries,
      emission_intensities_by_species: data.intensity,
      emissions_by_gas: data.gas,
      emissions_by_commodity: data.commodity,
    };
    if (module.id === "spatial") return { ok: true, data: config.maps.countries.includes(entry.country.id) ? [{ year: config.maps.referenceYear }] : [], url: config.sources.spatial.url };
    if (module.id === "resources") {
      const data = indicator.id === "scenario_handoff" ? config.resources.filter((item) => item.type === "Scenario analysis") : config.resources.filter((item) => item.type !== "Scenario analysis");
      return { ok: true, data, url: config.sources.resources.url };
    }
    return responseMap[indicator.endpoint] || { ok: false, data: [], error: "Endpoint not loaded" };
  }

  function indicatorRows(entry, module, indicator, selection) {
    const response = responseForIndicator(entry, module, indicator);
    let rows = response.data || [];
    if (indicator.field && ["livestockTimeseries", "poultryTimeseries"].includes(indicator.endpoint)) rows = rows.filter((row) => row.type === indicator.field);
    if (indicator.field && indicator.endpoint === "primary_production") rows = rows.filter((row) => row.product === indicator.field);
    if (selection.species.genetics && indicator.endpoint === "species") rows = rows.filter((row) => row.type === selection.species.genetics);
    if (selection.species.climate && ["emissions_timeseries_by_species", "emission_intensities_by_species"].includes(indicator.endpoint)) rows = rows.filter((row) => row.type === selection.species.climate);
    if (selection.species.climate && indicator.endpoint === "emissions_by_commodity") rows = rows.filter((row) => row.Type === selection.species.climate);
    return { response, rows };
  }

  function yearsFromRows(rows) {
    return rows.flatMap((row) => {
      const directText = row.year ?? String(row.date || "").slice(0, 4);
      const direct = directText === "" || directText == null ? Number.NaN : Number(directText);
      const benchmark = Object.keys(row).filter((key) => /^y\d{4}$/.test(key)).map((key) => Number(key.slice(1)));
      return [direct, ...benchmark].filter(Number.isFinite);
    });
  }

  function buildManifest(bundle) {
    const annualIds = new Set(["cattle_stocks", "goat_stocks", "sheep_stocks", "pig_stocks", "chicken_stocks", "species_ch4_trend"]);
    const indicatorLimitations = {
      reference_centres: "Country matching depends on current institutional records. No returned record does not mean that no relevant national or regional technical capacity exists.",
      related_resources: "These are curated general FAO resources, not evidence of country-specific projects or uptake.",
      scenario_handoff: "This is a hand-off to a separate scenario tool; it is not a historical observation or an automatically generated scenario.",
    };
    return selectedIndicatorModels(bundle.selection).map(({ module, indicator }) => {
      const countryData = bundle.countries.map((entry) => {
        const { response, rows } = indicatorRows(entry, module, indicator, bundle.selection);
        const years = [...new Set(yearsFromRows(rows))].sort((a, b) => a - b);
        return { country: entry.country, ok: response.ok, rows, years, error: response.error };
      });
      const available = countryData.filter((item) => item.rows.length);
      const failures = countryData.filter((item) => !item.ok);
      const status = failures.length === bundle.countries.length ? "error" : failures.length || (available.length && available.length < bundle.countries.length) ? "partial" : available.length === bundle.countries.length ? "ready" : "unavailable";
      const allYears = [...new Set(countryData.flatMap((item) => item.years))].sort((a, b) => a - b);
      const latest = allYears.at(-1);
      const expectedEnd = indicator.id === "species_ch4_trend" ? Math.min(bundle.selection.end, 2023) : bundle.selection.end;
      const expectedYears = Math.max(1, expectedEnd - bundle.selection.start + 1);
      const primaryYears = countryData[0]?.years || [];
      const coverage = annualIds.has(indicator.id) ? Math.round(primaryYears.filter((year) => year >= bundle.selection.start && year <= expectedEnd).length / expectedYears * 100) : null;
      let commonYears = countryData[0]?.years || [];
      countryData.slice(1).forEach((item) => { commonYears = commonYears.filter((year) => item.years.includes(year)); });
      const comparability = module.id === "resources" ? "Not country-specific" : bundle.countries.length === 1 ? "Single country" : commonYears.length ? `${commonYears.length} common year${commonYears.length === 1 ? "" : "s"}` : available.length === bundle.countries.length ? "Comparable snapshots" : "Limited";
      const totalRecords = module.id === "resources" ? countryData[0]?.rows.length || 0 : countryData.reduce((sum, item) => sum + item.rows.length, 0);
      const errorText = failures.length ? `${failures.map((item) => `${item.country.name}: ${item.error || "retrieval failed"}`).join("; ")}` : "";
      const coverageText = failures.length ? `Retry needed for ${failures.map((item) => item.country.name).join(", ")}` : module.id === "resources" ? `${totalRecords} curated link${totalRecords === 1 ? "" : "s"}` : coverage == null ? (latest ? `Latest ${latest}` : `${totalRecords} records`) : `${coverage}% · latest ${latest || "—"}`;
      return {
        moduleId: module.id,
        moduleLabel: module.label,
        sourceKey: module.sourceKey,
        indicatorId: indicator.id,
        indicatorLabel: indicator.label,
        unit: indicator.unit,
        evidenceType: indicator.evidenceType || module.evidenceType,
        status,
        statusLabel: status === "ready" ? "Ready" : status === "partial" ? failures.length ? "Partial / retry" : "Partial" : status === "error" ? "Retrieval error" : "No records",
        recordCount: totalRecords,
        latest,
        coverage,
        coverageText,
        comparability,
        limitation: indicatorLimitations[indicator.id] || module.limitations,
        errorText,
        endpoint: indicator.endpoint,
        countryData,
      };
    });
  }

  function renderReview(bundle) {
    const { selection } = bundle;
    const manifest = buildManifest(bundle);
    bundle.manifest = manifest;
    dom.review.replaceChildren();
    dom.reviewSummary.replaceChildren();
    const scopeItems = [
      ["Purpose", selection.purpose.label],
      ["Countries", [selection.country, ...selection.comparisons].map((item) => item.name).join(" + ")],
      ["Period", `${selection.start}–${selection.end}`],
      ["Evidence", `${selection.modules.length} modules · ${manifest.length} indicators`],
    ];
    scopeItems.forEach(([label, value]) => { const item = node("div", "review-stat"); item.append(node("span", "", label), node("strong", "", value)); dom.reviewSummary.append(item); });
    const wrap = node("div", "table-wrap");
    const table = node("table", "review-table evidence-matrix");
    table.innerHTML = "<thead><tr><th>Indicator</th><th>Evidence & unit</th><th>Coverage / latest</th><th>Comparability</th><th>Status</th><th>Known limitation</th></tr></thead>";
    const body = node("tbody");
    manifest.forEach((item) => {
      const source = config.sources[item.sourceKey];
      const tr = node("tr");
      const indicatorCell = node("td");
      indicatorCell.append(node("strong", "", item.indicatorLabel), node("span", "cell-sub", item.moduleLabel), link(source.label, source.url, "matrix-source"));
      const evidenceCell = node("td");
      evidenceCell.append(node("strong", "", item.evidenceType), node("span", "cell-sub", item.unit));
      const coverageCell = node("td", "", item.coverageText);
      const comparisonCell = node("td", "", item.comparability);
      const statusCell = node("td");
      statusCell.append(node("span", `coverage-pill ${item.status}`, item.statusLabel), node("span", "cell-sub", `${item.recordCount} record${item.recordCount === 1 ? "" : "s"}${item.errorText ? ` · ${item.errorText}` : ""}`));
      const limitationCell = node("td", "limitation-cell", item.limitation);
      tr.append(indicatorCell, evidenceCell, coverageCell, comparisonCell, statusCell, limitationCell);
      body.append(tr);
    });
    table.append(body);
    wrap.append(table);
    const notice = node("div", "review-notice");
    notice.innerHTML = "<strong>Evidence rule</strong><span>No composite quality score is invented. Coverage, recency, comparability, evidence type and limitations are shown separately, and the report uses this same frozen data bundle.</span>";
    dom.review.append(wrap, notice);
  }

  const rowsForType = (response, type) => (response?.data || []).filter((row) => row.type === type);

  function valuesByYear(response, type, years) {
    const map = new Map(rowsForType(response, type).map((row) => [Number(row.year), Number(row.value)]));
    return years.map((year) => Number.isFinite(map.get(year)) ? map.get(year) : null);
  }

  function changeFinding(name, metric, years, values, unit) {
    const valid = years.map((year, index) => ({ year, value: values[index] })).filter((item) => Number.isFinite(item.value));
    if (!valid.length) return `${metric}: no records were returned for ${name} in the selected period.`;
    if (valid.length === 1) return `${metric} for ${name} was ${number.format(valid[0].value)} ${unit} in ${valid[0].year}.`;
    const first = valid[0];
    const last = valid.at(-1);
    if (first.value === 0) return `${metric} for ${name} was ${number.format(last.value)} ${unit} in ${last.year}.`;
    const delta = (last.value - first.value) / first.value * 100;
    return `${metric} for ${name} ${delta >= 0 ? "increased" : "decreased"} by ${percent.format(Math.abs(delta))}% from ${first.year} to ${last.year}, reaching ${number.format(last.value)} ${unit}.`;
  }

  function tableFromChart(chart) {
    return { title: chart.title, headers: ["Year", ...chart.series.map((series) => `${series.name} (${chart.unit})`)], rows: chart.years.map((year, index) => [String(year), ...chart.series.map((series) => Number.isFinite(series.values[index]) ? number.format(series.values[index]) : "—")]) };
  }

  const indicatorSelected = (selection, id) => selection.indicators.includes(id);

  function populationSection(bundle) {
    const { selection } = bundle;
    const years = Array.from({ length: selection.end - selection.start + 1 }, (_, index) => selection.start + index);
    const indicatorTypes = [
      ["cattle_stocks", "Cattle"],
      ["goat_stocks", "Goats"],
      ["sheep_stocks", "Sheep"],
      ["pig_stocks", "Swine / pigs"],
      ["chicken_stocks", "Chickens"],
    ];
    const focusTypes = indicatorTypes.filter(([id]) => indicatorSelected(selection, id));
    const charts = focusTypes.map(([indicatorId, type], index) => {
      const series = bundle.countries.map((entry, countryIndex) => {
        const data = entry.modules.population;
        const response = type === "Chickens" ? data.poultry : data.livestock;
        return { name: entry.country.name, color: colors[countryIndex], values: valuesByYear(response, type, years) };
      });
      const metricNames = { Cattle: "Cattle stocks", Goats: "Goat stocks", Sheep: "Sheep stocks", "Swine / pigs": "Pig stocks", Chickens: "Chicken stocks" };
      const title = metricNames[type] || `${type} stocks`;
      const primaryData = bundle.countries[0].modules.population;
      const primaryResponse = type === "Chickens" ? primaryData.poultry : primaryData.livestock;
      const finding = primaryResponse.ok ? changeFinding(selection.country.name, title, years, series[0].values, "million head") : `${title} data could not be retrieved for ${selection.country.name}; retry is required and the result is not treated as zero.`;
      return { id: `population-${index}`, indicatorId, title, unit: "million head", years, series, source: config.sources.population.label, finding };
    }).filter((chart) => chart.series.some((series) => series.values.some(Number.isFinite)));
    return { id: "population", title: "Population trends", kicker: "POPULATION", intro: "Annual national livestock stocks, shown in millions of head. Poultry and terrestrial livestock are returned through separate Hub series and harmonized here for reporting.", charts, tables: [], findings: charts.map((chart) => chart.finding), notes: ["Values are displayed in millions of head, matching the Hub time-series response."], sourceKey: "population" };
  }

  const benchmarkYears = (selection) => [2015, 2020, 2024].filter((year) => year >= selection.start && year <= selection.end).length ? [2015, 2020, 2024].filter((year) => year >= selection.start && year <= selection.end) : [2015, 2020, 2024];

  function productionSection(bundle) {
    const years = benchmarkYears(bundle.selection);
    const productIndicators = [["meat_production", "Meat"], ["milk_production", "Milk"], ["egg_production", "Eggs"]];
    const charts = productIndicators.filter(([id]) => indicatorSelected(bundle.selection, id)).map(([indicatorId, product], index) => {
      const series = bundle.countries.map((entry, countryIndex) => {
        const row = entry.modules.production.primary.data.find((item) => item.product === product);
        return { name: entry.country.name, color: colors[countryIndex], values: years.map((year) => { const value = Number(row?.[`y${year}`]); return Number.isFinite(value) ? value : null; }) };
      });
      const primaryResponse = bundle.countries[0].modules.production.primary;
      const finding = primaryResponse.ok ? changeFinding(bundle.selection.country.name, `${product} production`, years, series[0].values, "t") : `${product} production data could not be retrieved for ${bundle.selection.country.name}; retry is required and the result is not treated as zero.`;
      return { id: `production-${index}`, indicatorId, title: `${product} production`, unit: "t", years, series, source: config.sources.production.label, finding };
    }).filter((chart) => chart.series.some((series) => series.values.some(Number.isFinite)));
    const fallback = years.some((year) => year < bundle.selection.start || year > bundle.selection.end);
    return { id: "production", title: "Production & productivity", kicker: "PRODUCTION", intro: "Benchmark views of total primary meat and milk production and primary egg production. The Hub currently returns 2015, 2020 and 2024 snapshots for this summary.", charts, tables: [], findings: charts.map((chart) => chart.finding), notes: fallback ? ["No benchmark year fell wholly inside the selected period, so the available 2015, 2020 and 2024 snapshots are shown."] : [], sourceKey: "production" };
  }

  function geneticsSection(bundle) {
    const { species } = bundle.selection;
    const breedRows = [];
    const adaptedRows = [];
    const riskRows = [];
    const materialRows = [];
    const optionalNumber = (object, key) => Object.prototype.hasOwnProperty.call(object, key) && object[key] !== "" && object[key] != null ? number.format(Number(object[key])) : "—";
    for (const entry of bundle.countries) {
      const data = entry.modules.genetics;
      const grouped = new Map();
      for (const row of data.breeds.data) {
        if (species.genetics && row.type !== species.genetics) continue;
        if (!grouped.has(row.type)) grouped.set(row.type, { Local: 0, Transboundary: 0 });
        grouped.get(row.type)[row.distribution] = Number(row.value) || 0;
      }
      for (const [type, counts] of grouped) breedRows.push([entry.country.name, type, number.format(counts.Local || 0), number.format(counts.Transboundary || 0), number.format((counts.Local || 0) + (counts.Transboundary || 0))]);
      if (!data.breeds.ok) breedRows.push([entry.country.name, "Retrieval error", "—", "—", data.breeds.error || "Retry needed"]);
      const adapted = Object.fromEntries(data.adaptedness.data.map((row) => [row.type, row.value]));
      const risk = Object.fromEntries(data.risk.data.map((row) => [row.type, row.value]));
      if (data.adaptedness.ok) adaptedRows.push([entry.country.name, optionalNumber(adapted, "Native"), optionalNumber(adapted, "Locally adapted"), optionalNumber(adapted, "Exotic")]);
      else adaptedRows.push([entry.country.name, "Retrieval error", data.adaptedness.error || "Retry needed", "—"]);
      if (data.risk.ok) riskRows.push([entry.country.name, optionalNumber(risk, "Local Breed at Risk"), optionalNumber(risk, "Local Breed Not at Risk")]);
      else riskRows.push([entry.country.name, "Retrieval error", data.risk.error || "Retry needed"]);
      const material = Object.fromEntries(data.material.data.map((row) => [row.type, row.value]));
      if (data.material.ok) materialRows.push([entry.country.name, optionalNumber(material, "Sufficient"), optionalNumber(material, "Not Sufficient"), optionalNumber(material, "No Material"), optionalNumber(material, "No Information")]);
      else materialRows.push([entry.country.name, "Retrieval error", data.material.error || "Retry needed", "—", "—"]);
    }
    const focus = species.id === "all" ? "all available species" : species.label.toLowerCase();
    const tables = [];
    const findings = [];
    const primary = bundle.countries[0].modules.genetics;
    if (indicatorSelected(bundle.selection, "breed_records")) {
      tables.push({ indicatorId: "breed_records", title: "National breed records by species", headers: ["Country", "Species", "Local", "Transboundary", "Total records"], rows: breedRows });
      if (primary.breeds.ok) {
        const primaryTotal = breedRows.filter((row) => row[0] === bundle.selection.country.name).reduce((sum, row) => sum + Number(String(row[4]).replaceAll(",", "")), 0);
        findings.push(primaryTotal ? `${bundle.selection.country.name} has ${number.format(primaryTotal)} DAD-IS national breed records across ${focus} in this snapshot.` : `DAD-IS returned no breed records for ${focus} in ${bundle.selection.country.name}; this should not be interpreted as absence of breeds.`);
      }
    }
    if (indicatorSelected(bundle.selection, "breed_adaptedness")) {
      tables.push({ indicatorId: "breed_adaptedness", title: "Breed adaptedness snapshot", headers: ["Country", "Native", "Locally adapted", "Exotic"], rows: adaptedRows });
      if (primary.adaptedness.ok) findings.push(`DAD-IS adaptedness fields are shown separately for ${bundle.selection.country.name}; missing categories remain unreported rather than being converted to zero.`);
    }
    if (indicatorSelected(bundle.selection, "breed_extinction_risk")) {
      tables.push({ indicatorId: "breed_extinction_risk", title: "Local-breed risk snapshot", headers: ["Country", "Local at risk", "Local not at risk"], rows: riskRows });
      if (primary.risk.ok) findings.push(`DAD-IS local-breed risk records are available for ${bundle.selection.country.name}; unknown-risk records are outside this selected indicator.`);
    }
    if (indicatorSelected(bundle.selection, "genetic_material")) {
      tables.push({ indicatorId: "genetic_material", title: "Genetic material status", headers: ["Country", "Sufficient", "Not sufficient", "No material", "No information"], rows: materialRows });
      if (primary.material.ok) findings.push(`Reported genetic-material status is included for ${bundle.selection.country.name}; empty categories mean unreported or unavailable.`);
    }
    return { id: "genetics", title: "Breeds & genetic resources", kicker: "GENETIC RESOURCES", intro: "DAD-IS country records describe locally reported breeds and their distribution. Transboundary records may appear in more than one country and are not global distinct-breed counts.", charts: [], tables, findings, notes: ["Counts are national DAD-IS breed records, not globally deduplicated breeds. Empty fields mean not reported or unavailable."], sourceKey: "genetics" };
  }

  function healthSection(bundle) {
    const years = Array.from({ length: bundle.selection.end - bundle.selection.start + 1 }, (_, index) => bundle.selection.start + index);
    const series = bundle.countries.map((entry, countryIndex) => {
      const totals = new Map();
      for (const row of entry.modules.health.events.data) { const year = Number(String(row.date).slice(0, 4)); totals.set(year, (totals.get(year) || 0) + (Number(row.value) || 0)); }
      return { name: entry.country.name, color: colors[countryIndex], values: years.map((year) => totals.has(year) ? totals.get(year) : null) };
    });
    const topRows = [];
    const seasonalityRows = [];
    const centreRows = [];
    for (const entry of bundle.countries) {
      const totals = new Map();
      for (const row of entry.modules.health.events.data) totals.set(row.type, (totals.get(row.type) || 0) + (Number(row.value) || 0));
      if (!entry.modules.health.events.ok) topRows.push([entry.country.name, "Retrieval error", entry.modules.health.events.error || "Retry needed"]);
      else {
        [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([disease, value]) => topRows.push([entry.country.name, disease, number.format(value)]));
        if (!totals.size) topRows.push([entry.country.name, "No records returned", "—"]);
      }
      if (!entry.modules.health.seasonality.ok) seasonalityRows.push([entry.country.name, "Retrieval error", "—", entry.modules.health.seasonality.error || "Retry needed"]);
      else entry.modules.health.seasonality.data.slice().sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).slice(0, 12).forEach((row) => seasonalityRows.push([entry.country.name, row.type, row.month, number.format(row.value)]));
      if (!entry.modules.health.referenceCentres.ok) centreRows.push([entry.country.name, "Retrieval error", "—", entry.modules.health.referenceCentres.error || "Retry needed", "—"]);
      else entry.modules.health.referenceCentres.data.forEach((row) => centreRows.push([entry.country.name, row.institute || "—", row.city || "—", Array.isArray(row.referenceCentreFor) ? row.referenceCentreFor.join(", ") : row.referenceCentreFor || "—", row.expiryDate || "—"]));
    }
    const total = series[0].values.filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
    const primary = bundle.countries[0].modules.health;
    const findings = [];
    const eventsSelected = indicatorSelected(bundle.selection, "confirmed_disease_events") || indicatorSelected(bundle.selection, "top_reported_diseases");
    if (eventsSelected) {
      if (!primary.events.ok) findings.push(`EMPRES-i event data could not be retrieved for ${bundle.selection.country.name}; the mockup marks this as a retrieval error and does not interpret it as zero events.`);
      else findings.push(total ? `EMPRES-i returned ${number.format(total)} confirmed reported disease events for ${bundle.selection.country.name} in ${bundle.selection.start}–${bundle.selection.end}.` : `EMPRES-i returned no confirmed event records for ${bundle.selection.country.name} in the selected period; this is not evidence that disease was absent.`);
    }
    if (indicatorSelected(bundle.selection, "disease_seasonality") && !eventsSelected) {
      if (!primary.seasonality.ok) findings.push(`EMPRES-i seasonality data could not be retrieved for ${bundle.selection.country.name}; retry is required.`);
      else findings.push(primary.seasonality.data.length ? `Reported-event seasonality records are available for ${bundle.selection.country.name} and should be interpreted in the context of surveillance and reporting practices.` : `No seasonality records were returned for ${bundle.selection.country.name}; this is not evidence of disease absence.`);
    }
    if (indicatorSelected(bundle.selection, "reference_centres") && !eventsSelected && !indicatorSelected(bundle.selection, "disease_seasonality")) {
      if (!primary.referenceCentres.ok) findings.push(`FAO reference-centre records could not be retrieved for ${bundle.selection.country.name}; retry is required.`);
      else findings.push(primary.referenceCentres.data.length ? `${number.format(primary.referenceCentres.data.length)} FAO reference-centre record(s) were returned for ${bundle.selection.country.name}.` : `No country-matched FAO reference-centre records were returned for ${bundle.selection.country.name}.`);
    }
    const chart = { id: "health-events", indicatorId: "confirmed_disease_events", title: "Confirmed reported disease events", unit: "events", years, series, source: config.sources.health.label, finding: findings[0] || "Reported-event records are shown with their source limitations.", suppressChange: true };
    const charts = indicatorSelected(bundle.selection, "confirmed_disease_events") ? [chart] : [];
    const tables = [];
    if (indicatorSelected(bundle.selection, "top_reported_diseases")) tables.push({ indicatorId: "top_reported_diseases", title: "Most frequently reported diseases in the selected period", headers: ["Country", "Disease", "Reported events / status"], rows: topRows });
    if (indicatorSelected(bundle.selection, "disease_seasonality")) tables.push({ indicatorId: "disease_seasonality", title: "Highest reported-event month and disease combinations", headers: ["Country", "Disease / status", "Month", "Reported events / status"], rows: seasonalityRows });
    if (indicatorSelected(bundle.selection, "reference_centres")) tables.push({ indicatorId: "reference_centres", title: "FAO reference centres returned for the country", headers: ["Country", "Institute / status", "City", "Reference centre for / status", "Expiry date"], rows: centreRows });
    const eventEvidenceSelected = eventsSelected || indicatorSelected(bundle.selection, "disease_seasonality");
    const intro = eventEvidenceSelected ? "Counts of confirmed events reported to EMPRES-i. Differences can reflect reporting and surveillance practices and should not be interpreted as disease incidence or country performance." : "Country-matched FAO reference-centre records provide an institutional signpost for follow-up; they are not a measure of national system capacity.";
    const notes = eventEvidenceSelected ? ["Years with no returned records are shown as missing, not zero. No-record results do not demonstrate disease absence. Cross-country comparisons require epidemiological and surveillance context."] : ["No country-matched record does not mean that relevant national or regional technical capacity is absent. Confirm institutional coverage with the source owner."];
    return { id: "health", title: "Animal health", kicker: "HEALTH", intro, charts, tables, findings, notes, sourceKey: "health" };
  }

  function climateSection(bundle) {
    const end = Math.min(bundle.selection.end, 2023);
    const years = end >= bundle.selection.start ? Array.from({ length: end - bundle.selection.start + 1 }, (_, index) => bundle.selection.start + index) : [];
    const focusTypes = bundle.selection.species.id === "all" ? ["Cattle", "Goats", "Sheep", "Pigs", "Chickens"] : [bundle.selection.species.climate];
    const charts = (indicatorSelected(bundle.selection, "species_ch4_trend") ? focusTypes : []).map((type, index) => {
      const series = bundle.countries.map((entry, countryIndex) => ({ name: entry.country.name, color: colors[countryIndex], values: valuesByYear(entry.modules.climate.timeseries, type, years) }));
      const primaryResponse = bundle.countries[0].modules.climate.timeseries;
      const finding = primaryResponse.ok ? changeFinding(bundle.selection.country.name, `${type} methane emissions`, years, series[0].values, "kt CH₄") : `${type} methane-emissions data could not be retrieved for ${bundle.selection.country.name}; retry is required.`;
      return { id: `climate-${index}`, indicatorId: "species_ch4_trend", title: `${type} methane emissions`, unit: "kt CH₄", years, series, source: config.sources.climate.label, finding };
    }).filter((chart) => chart.series.some((series) => series.values.some(Number.isFinite)));
    const intensityRows = [];
    const gasRows = [];
    const commodityRows = [];
    for (const entry of bundle.countries) {
      const climate = entry.modules.climate;
      if (!climate.intensity.ok) intensityRows.push([entry.country.name, "Retrieval error", "—", climate.intensity.error || "Retry needed", "—"]);
      else climate.intensity.data.filter((row) => !bundle.selection.species.climate || row.type === bundle.selection.species.climate).forEach((row) => intensityRows.push([entry.country.name, row.type, row.commodity, number.format(row.value), row.unit]));
      if (!climate.gas.ok) gasRows.push([entry.country.name, "Retrieval error", climate.gas.error || "Retry needed", "—"]);
      else climate.gas.data.forEach((row) => gasRows.push([entry.country.name, row.Gas || row.gas || "—", row.Value || row.value || "—", "2023"]));
      if (!climate.commodity.ok) commodityRows.push([entry.country.name, "Retrieval error", "—", "—", "—", climate.commodity.error || "Retry needed"]);
      else climate.commodity.data.filter((row) => !bundle.selection.species.climate || row.Type === bundle.selection.species.climate).forEach((row) => commodityRows.push([entry.country.name, row.Type, row.Meat == null ? "—" : number.format(row.Meat), row.Milk == null ? "—" : number.format(row.Milk), row.Eggs == null ? "—" : number.format(row.Eggs), row.Total == null ? "—" : number.format(row.Total)]));
    }
    const tables = [];
    if (indicatorSelected(bundle.selection, "emission_intensity")) tables.push({ indicatorId: "emission_intensity", title: "Emission intensity by species and commodity (2023)", headers: ["Country", "Species", "Commodity", "Value", "Unit"], rows: intensityRows });
    if (indicatorSelected(bundle.selection, "gas_snapshot")) tables.push({ indicatorId: "gas_snapshot", title: "Livestock emissions by gas (2023)", headers: ["Country", "Gas", "Value", "Year"], rows: gasRows });
    if (indicatorSelected(bundle.selection, "emissions_by_commodity")) tables.push({ indicatorId: "emissions_by_commodity", title: "Emissions by species and commodity", headers: ["Country", "Species", "Meat", "Milk", "Eggs", "Total (Mt CO₂ eq)"], rows: commodityRows });
    const findings = charts.slice(0, 2).map((chart) => chart.finding);
    const primary = bundle.countries[0].modules.climate;
    const climateSpecies = bundle.selection.species.climate;
    const selectedSnapshotAvailable = indicatorSelected(bundle.selection, "emission_intensity") && primary.intensity.ok && primary.intensity.data.some((row) => !climateSpecies || row.type === climateSpecies)
      || indicatorSelected(bundle.selection, "gas_snapshot") && primary.gas.ok && primary.gas.data.length
      || indicatorSelected(bundle.selection, "emissions_by_commodity") && primary.commodity.ok && primary.commodity.data.some((row) => !climateSpecies || row.Type === climateSpecies);
    if (!findings.length && selectedSnapshotAvailable) findings.push(`The selected 2023 modelled livestock emissions indicators are available for ${bundle.selection.country.name}; they are model outputs, not direct observations.`);
    return { id: "climate", title: "Climate & environment", kicker: "CLIMATE", intro: "Modelled livestock methane trends are paired with 2023 emissions and commodity-level intensity. They are model outputs and remain distinct from reported production and animal-health observations.", charts, tables, findings, notes: ["The Hub methane time series currently ends in 2023. Emission intensity is a 2023 snapshot in kg CO₂ eq per kg product."], sourceKey: "climate" };
  }

  function spatialSection(bundle) {
    const maps = bundle.countries.map((entry) => ({ country: entry.country, available: config.maps.countries.includes(entry.country.id), path: `maps/${entry.country.id}.png` }));
    const finding = maps.some((item) => item.available) ? `A prepared GLW4 2020 cattle-density image is available for ${maps.filter((item) => item.available).map((item) => item.country.name).join(" and ")}.` : "Open the Livestock Hub to explore GLW4 spatial layers for the selected country.";
    return { id: "spatial", title: "Spatial evidence", kicker: "SPATIAL", intro: "GLW4 provides modelled livestock-density surfaces that complement national totals by showing within-country spatial patterns.", charts: [], tables: [], maps, findings: [finding], notes: ["Map reference year: 2020. Unit: modelled head per km². Administrative boundaries are for visualization."], sourceKey: "spatial" };
  }

  function resourcesSection(bundle) {
    const includeRelated = indicatorSelected(bundle.selection, "related_resources");
    const includeScenarios = indicatorSelected(bundle.selection, "scenario_handoff");
    const resources = config.resources.filter((item) => (includeRelated && item.type !== "Scenario analysis") || (includeScenarios && item.type === "Scenario analysis"));
    const findings = [];
    if (includeRelated) findings.push("The profile links selected historical evidence to the relevant specialist FAO data and knowledge systems.");
    if (includeScenarios) findings.push("Scenario modelling remains a separate, explicitly labelled hand-off to GLEAM-X rather than being presented as historical evidence.");
    return { id: "resources", title: "Related tools & knowledge", kicker: "NEXT ANALYSIS", intro: "Continue from the country profile into the specialist systems that hold the underlying statistics, disease reports, breed records and scenario-analysis tools. These links are not presented as evidence of country-specific projects.", charts: [], tables: [], resources, findings, notes: [], sourceKey: "resources" };
  }

  function buildReport(bundle) {
    const builders = { population: populationSection, genetics: geneticsSection, production: productionSection, health: healthSection, climate: climateSection, spatial: spatialSection, resources: resourcesSection };
    const priority = bundle.selection.emphasis.id === "balanced"
      ? bundle.selection.purpose.recommendedModules || bundle.selection.emphasis.priorityModules || []
      : bundle.selection.emphasis.priorityModules || [];
    const orderedIds = [...bundle.selection.modules].sort((a, b) => {
      if (a === "resources") return 1;
      if (b === "resources") return -1;
      const left = priority.includes(a) ? priority.indexOf(a) : priority.length + bundle.selection.modules.indexOf(a);
      const right = priority.includes(b) ? priority.indexOf(b) : priority.length + bundle.selection.modules.indexOf(b);
      return left - right;
    });
    let sections = orderedIds.map((id) => builders[id]?.(bundle)).filter(Boolean);
    if (bundle.selection.depth.id === "snapshot") {
      sections = sections.map((section) => {
        const charts = section.charts.slice(0, 1);
        return {
          ...section,
          charts,
          tables: section.tables.slice(0, 1),
          maps: section.maps?.slice(0, 1),
          resources: section.resources?.slice(0, 3),
          notes: section.notes.slice(0, 1),
          findings: charts.length ? charts.map((chart) => chart.finding) : section.findings.slice(0, 1),
        };
      });
    }
    const findings = [...new Set(sections.flatMap((section) => section.findings || []).filter(Boolean))].slice(0, bundle.selection.depth.maxFindings || 7);
    const sources = [...new Set(sections.map((section) => section.sourceKey))].map((key) => config.sources[key]).filter(Boolean);
    const manifest = bundle.manifest || buildManifest(bundle);
    const report = {
      id: bundle.id,
      selection: bundle.selection,
      accessedAt: bundle.accessedAt,
      sections,
      findings,
      sources,
      manifest,
      filename: `livestock-country-report-${bundle.selection.country.id.toLowerCase()}-${bundle.selection.start}-${bundle.selection.end}`,
    };
    report.analysis = buildAnalysisModel(report);
    return report;
  }

  function latestPoint(chart) {
    const values = chart.series[0]?.values || [];
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (Number.isFinite(values[index])) return { value: values[index], year: chart.years[index], index };
    }
    return null;
  }

  function firstPoint(chart) {
    const values = chart.series[0]?.values || [];
    for (let index = 0; index < values.length; index += 1) {
      if (Number.isFinite(values[index])) return { value: values[index], year: chart.years[index], index };
    }
    return null;
  }

  function kpiFromChart(section, chart) {
    const first = firstPoint(chart);
    const latest = latestPoint(chart);
    if (!latest) return null;
    let change = `Latest available · ${latest.year}`;
    if (section.sourceKey === "health") {
      change = `Reported records · ${latest.year}`;
    } else if (first && first.index !== latest.index && first.value !== 0) {
      const delta = (latest.value - first.value) / first.value * 100;
      change = `${delta >= 0 ? "+" : ""}${percent.format(delta)}% since ${first.year}`;
    }
    return {
      label: chart.title,
      value: number.format(latest.value),
      unit: chart.unit,
      change,
      source: config.sources[section.sourceKey]?.label || "Selected source",
      evidenceType: section.sourceKey === "health" ? "Reported events" : section.sourceKey === "climate" || section.sourceKey === "spatial" ? "Modelled" : "Official / estimated",
    };
  }

  function buildAnalysisModel(report) {
    const kpis = report.sections.flatMap((section) => section.charts.map((chart) => kpiFromChart(section, chart))).filter(Boolean).slice(0, 4);
    if (!kpis.length) {
      const ready = report.manifest.filter((item) => item.status === "ready").length;
      kpis.push({ label: "Selected evidence", value: String(report.manifest.length), unit: "indicators", change: `${ready} ready for all selected countries`, source: "Evidence manifest", evidenceType: "Coverage summary" });
    }

    const signals = report.findings.map((text, index) => {
      const section = report.sections.find((item) => item.findings?.includes(text));
      return {
        title: `Evidence signal ${index + 1}`,
        text,
        meta: section ? `${config.sources[section.sourceKey]?.label || section.title} · ${section.kicker}` : "Reviewed evidence bundle",
      };
    });

    const gaps = [];
    report.manifest.forEach((item) => {
      if (item.status !== "ready") gaps.push({ title: `${item.indicatorLabel}: ${item.statusLabel}`, text: `${item.coverageText}; ${item.comparability}. ${item.limitation}` });
      else if (item.coverage != null && item.coverage < 80) gaps.push({ title: `${item.indicatorLabel}: incomplete annual coverage`, text: `${item.coverageText}. Confirm gaps against the source before interpretation.` });
      else if (item.latest && item.latest < Math.min(report.selection.end, item.indicatorId === "species_ch4_trend" ? 2023 : report.selection.end)) gaps.push({ title: `${item.indicatorLabel}: data lag`, text: `Latest returned year: ${item.latest}; requested end year: ${report.selection.end}.` });
    });
    const limitations = report.sections.flatMap((section) => section.notes || []);
    while (gaps.length < 4 && limitations.length) {
      const text = limitations.shift();
      if (!gaps.some((item) => item.text === text)) gaps.push({ title: "Interpretation caution", text });
    }
    if (!gaps.length) gaps.push({ title: "Country validation still required", text: "All selected indicators returned data, but source definitions, country reporting context and unusual changes still require technical review." });

    const country = report.selection.country.name;
    const peers = report.selection.comparisons.map((item) => item.name);
    const compareText = peers.length ? `What explains the differences between ${country} and ${peers.join(" / ")}, and are the common years genuinely comparable?` : "Which peer countries would provide the most meaningful technical comparison, and why?";
    const purposeQuestions = {
      overview: `Which of these signals best describe the livestock sector priorities that national counterparts would recognize?`,
      "policy-dialogue": `Which data gaps or unusual changes should be validated with national counterparts before the next policy dialogue?`,
      "programme-design": `Which problem statement is supported by the evidence, and what additional subnational or value-chain data are needed before programme design?`,
      "investment-scoping": `Which production constraints, environmental trade-offs and market evidence still need appraisal before investment decisions?`,
      "risk-monitoring": `Which reported animal-health signals need closer surveillance review, and what reporting changes could explain the pattern?`,
    };
    const nextAnalyses = [];
    if (report.selection.modules.includes("climate")) nextAnalyses.push("Test mitigation scenarios in GLEAM-X; keep scenario results separate from this historical profile.");
    if (report.selection.modules.includes("health")) nextAnalyses.push("Review event-level epidemiological context in EMPRES-i and validate surveillance coverage.");
    if (report.selection.modules.includes("production") || report.selection.modules.includes("population")) nextAnalyses.push("Inspect the underlying FAOSTAT series, flags and definitions for any break or outlier.");
    if (report.selection.modules.includes("spatial")) nextAnalyses.push("Use the Livestock Platform to combine GLW4 with subnational, environmental or service-access layers.");
    if (!nextAnalyses.length) nextAnalyses.push("Validate the evidence manifest with the relevant data owner before using the profile externally.");
    const dialogue = [
      { title: "Question for country dialogue", text: purposeQuestions[report.selection.purpose.id] || purposeQuestions.overview },
      { title: "Question for comparison", text: compareText },
      ...nextAnalyses.slice(0, 3).map((text) => ({ title: "Suggested next analysis", text })),
    ];
    return { kpis, signals, gaps: gaps.slice(0, 6), dialogue };
  }

  function makeTable(tableModel) {
    const wrap = node("div", "table-wrap report-table-wrap");
    const table = node("table", "report-table");
    const caption = node("caption", "", tableModel.title);
    const head = node("thead");
    const headRow = node("tr");
    tableModel.headers.forEach((header) => headRow.append(node("th", "", header)));
    head.append(headRow);
    const body = node("tbody");
    if (!tableModel.rows.length) {
      const row = node("tr");
      const cell = node("td", "empty-cell", "No records returned for this selection.");
      cell.colSpan = tableModel.headers.length;
      row.append(cell);
      body.append(row);
    } else {
      tableModel.rows.forEach((values) => { const row = node("tr"); values.forEach((value) => row.append(node("td", "", value))); body.append(row); });
    }
    table.append(caption, head, body);
    wrap.append(table);
    return wrap;
  }

  function makeKpiCard(item) {
    const card = node("article", "kpi-card");
    card.append(node("span", "kpi-label", item.label), node("strong", "", item.value), node("span", "kpi-unit", item.unit), node("span", "kpi-change", item.change));
    card.title = `${item.evidenceType} · ${item.source}`;
    return card;
  }

  function makeAnalysisItem(item) {
    const wrapper = node("article", "analysis-item");
    wrapper.append(node("strong", "", item.title), node("span", "", item.text));
    if (item.meta) wrapper.append(node("small", "", item.meta));
    return wrapper;
  }

  function renderAnalysis(report) {
    if (renderedReportId && renderedReportId !== report.id) clearRenderedReport();
    activeReport = report;
    dom.analysisDashboard.replaceChildren(...report.analysis.kpis.map(makeKpiCard));
    dom.analysisSignals.replaceChildren(...report.analysis.signals.map(makeAnalysisItem));
    dom.analysisGaps.replaceChildren(...report.analysis.gaps.map(makeAnalysisItem));
    dom.analysisDialogue.replaceChildren(...report.analysis.dialogue.map((item) => {
      const card = node("article", "dialogue-card");
      card.append(node("strong", "", item.title), node("span", "", item.text));
      return card;
    }));
    setStep(4);
    $("#analysis-title")?.focus({ preventScroll: true });
  }

  function chartCard(chart) {
    const card = node("article", "chart-card");
    const header = node("div", "chart-card-header");
    const titleWrap = node("div");
    titleWrap.append(node("h4", "", chart.title), node("span", "chart-unit", chart.unit));
    const valid = chart.series[0]?.values.filter(Number.isFinite) || [];
    if (!chart.suppressChange && valid.length > 1 && valid[0] !== 0) {
      const delta = (valid.at(-1) - valid[0]) / valid[0] * 100;
      header.append(titleWrap, node("span", `change-badge ${delta >= 0 ? "up" : "down"}`, `${delta >= 0 ? "+" : ""}${percent.format(delta)}%`));
    } else header.append(titleWrap);
    const legend = node("div", "chart-legend");
    chart.series.forEach((series) => { const item = node("span"); const swatch = node("i"); swatch.style.background = series.color; item.append(swatch, document.createTextNode(series.name)); legend.append(item); });
    const canvas = node("canvas", "country-chart");
    const details = node("details", "chart-data");
    details.append(node("summary", "", "View data table"), makeTable(tableFromChart(chart)));
    card.append(header, legend, canvas, node("p", "chart-finding", chart.finding), details);
    requestAnimationFrame(() => window.renderCountryChart(canvas, chart));
    return card;
  }

  function renderSection(section) {
    const wrapper = node("section", "report-section panel");
    wrapper.id = `report-${section.id}`;
    const header = node("div", "section-heading");
    const headingText = node("div");
    headingText.append(node("p", "section-kicker", section.kicker), node("h3", "", section.title), node("p", "section-intro", section.intro));
    header.append(headingText, link(config.sources[section.sourceKey].provider, config.sources[section.sourceKey].url, "source-chip"));
    wrapper.append(header);
    if (section.charts.length) { const grid = node("div", "chart-grid"); section.charts.forEach((chart) => grid.append(chartCard(chart))); wrapper.append(grid); }
    section.tables.forEach((table) => wrapper.append(makeTable(table)));
    if (section.maps) {
      const grid = node("div", "map-grid");
      section.maps.forEach((item) => {
        const card = node("article", "map-card");
        if (item.available) { const image = node("img"); image.src = item.path; image.alt = `${item.country.name} modelled cattle density map, 2020`; card.append(image, node("h4", "", `${item.country.name} · cattle density`), node("p", "", "GLW4 2020 · modelled head per km²")); }
        else card.append(node("div", "map-placeholder", "Map available in the Livestock Hub"), node("h4", "", item.country.name), link("Open spatial layers", config.sources.spatial.hubUrl));
        grid.append(card);
      });
      wrapper.append(grid);
    }
    if (section.resources) {
      const grid = node("div", "resource-grid");
      section.resources.forEach((resource) => { const card = node("article", "resource-card"); card.append(node("span", "resource-type", resource.type), node("h4", "", resource.title), node("p", "", resource.description), link("Open resource ↗", resource.url)); grid.append(card); });
      wrapper.append(grid);
    }
    if (section.notes.length) { const note = node("div", "method-note"); note.append(node("strong", "", "Interpretation note")); section.notes.forEach((text) => note.append(node("p", "", text))); wrapper.append(note); }
    return wrapper;
  }

  function renderSources(report) {
    dom.sources.replaceChildren();
    const intro = node("p", "", `Live data accessed ${dateTime.format(report.accessedAt)}. The selected modules are generated from the same frozen response bundle used by the charts, tables and downloads.`);
    const list = node("div", "source-list");
    report.sources.forEach((source) => { const item = node("div", "source-item"); const text = node("div"); text.append(node("strong", "", source.label), node("p", "", source.method)); item.append(text, link("Open source ↗", source.url)); list.append(item); });
    const manifestTable = makeTable({
      title: "Selected indicator evidence manifest",
      headers: ["Module", "Indicator", "Evidence type", "Unit", "Coverage / latest", "Comparability", "Status"],
      rows: report.manifest.map((item) => [item.moduleLabel, item.indicatorLabel, item.evidenceType, item.unit, item.coverageText, item.comparability, item.statusLabel]),
    });
    const caveat = node("div", "method-note");
    caveat.innerHTML = "<strong>Mockup boundary</strong><p>This is a configurable, semi-automated evidence profile mockup, not an official FAO country report or publication. Historical observations, reported disease events and modelled emissions remain labelled and are not merged into an unqualified score. Scenario analysis is handed off to specialist tools such as GLEAM-X.</p>";
    dom.sources.append(intro, list);
    if (report.selection.depth.includeAppendix) dom.sources.append(manifestTable);
    dom.sources.append(caveat);
  }

  function renderReport(report) {
    const peers = report.selection.comparisons.map((item) => item.name);
    dom.reportTitle.textContent = peers.length ? `${report.selection.country.name} livestock profile with ${peers.join(" and ")}` : `${report.selection.country.name} livestock profile`;
    dom.reportMeta.textContent = `${report.selection.purpose.label} · ${report.selection.depth.label} · ${report.selection.emphasis.label} · ${report.selection.start}–${report.selection.end} · ${report.selection.species.label}`;
    dom.summary.hidden = false;
    dom.summary.replaceChildren();
    const summaryHeading = node("div", "summary-heading");
    summaryHeading.append(node("p", "section-kicker", "EXECUTIVE SUMMARY"), node("h3", "", "Evidence at a glance"));
    const kpis = node("div", "kpi-grid report-kpi-grid");
    report.analysis.kpis.forEach((item) => kpis.append(makeKpiCard(item)));
    const findings = node("ul", "finding-list");
    report.findings.forEach((finding) => findings.append(node("li", "", finding)));
    const tags = node("div", "report-tags");
    report.sections.forEach((section) => tags.append(node("span", "", section.title)));
    dom.summary.append(summaryHeading, kpis, findings, tags);
    dom.reportNavigation.replaceChildren();
    report.sections.forEach((section) => {
      const anchor = link(section.title, `#report-${section.id}`);
      anchor.target = "";
      anchor.rel = "";
      dom.reportNavigation.append(anchor);
    });
    dom.charts.replaceChildren(...report.sections.map(renderSection));
    renderSources(report);
    dom.exportCsv.disabled = false;
    dom.exportJson.disabled = false;
    dom.printReport.disabled = false;
    dom.exportWord.disabled = false;
    activeReport = report;
    renderedReportId = report.id;
    setStep(5);
    dom.reportTitle.focus({ preventScroll: true });
  }

  function csvCell(value) { const text = String(value ?? ""); return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = node("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportCsv(report) {
    const rows = [["module", "indicator", "country", "year_or_category", "row_context", "value", "unit", "evidence_type", "source_url", "accessed_at"]];
    for (const section of report.sections) {
      const source = config.sources[section.sourceKey];
      const evidenceFor = (model) => report.manifest.find((item) => item.indicatorId === model.indicatorId) || report.manifest.find((item) => item.moduleId === section.id) || { evidenceType: "Linked resource", unit: "" };
      section.charts.forEach((chart) => {
        const evidence = evidenceFor(chart);
        chart.series.forEach((series) => chart.years.forEach((year, index) => rows.push([section.title, chart.title, series.name, year, "time series", series.values[index] ?? "", evidence.unit || chart.unit, evidence.evidenceType, source.url, report.accessedAt.toISOString()])));
      });
      section.tables.forEach((table) => table.rows.forEach((values, rowIndex) => {
        const evidence = evidenceFor(table);
        const country = report.selection.country.name === values[0] || report.selection.comparisons.some((item) => item.name === values[0]) ? values[0] : report.selection.country.name;
        const context = table.headers.map((header, index) => `${header}: ${values[index] ?? ""}`).join(" · ");
        values.forEach((value, columnIndex) => {
          if (columnIndex === 0 && value === country) return;
          rows.push([section.title, `${table.title} · ${table.headers[columnIndex] || `Column ${columnIndex + 1}`}`, country, `row ${rowIndex + 1}`, context, value ?? "", evidence.unit, evidence.evidenceType, source.url, report.accessedAt.toISOString()]);
        });
      }));
      (section.maps || []).forEach((item) => {
        const evidence = evidenceFor({ indicatorId: "glw4_cattle_density" });
        rows.push([section.title, "GLW4 cattle density map", item.country.name, config.maps.referenceYear, item.available ? item.path : "Livestock Hub layer", item.available ? "Prepared map available" : "Open Hub layer", evidence.unit || config.maps.unit, evidence.evidenceType, source.url, report.accessedAt.toISOString()]);
      });
      (section.resources || []).forEach((item) => {
        const indicatorId = item.type === "Scenario analysis" ? "scenario_handoff" : "related_resources";
        const evidence = evidenceFor({ indicatorId });
        rows.push([section.title, item.title, report.selection.country.name, "linked resource", item.type, item.url, evidence.unit || "link", evidence.evidenceType, item.url, report.accessedAt.toISOString()]);
      });
    }
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${report.filename}.csv`);
    setExportStatus("Underlying report data downloaded as a long-format CSV with evidence and source fields.");
  }

  async function exportWord(report) {
    const template = dom.exportTemplate.value;
    const statistics = [];
    for (const section of report.sections) {
      for (const chart of section.charts) {
        const table = tableFromChart(chart);
        statistics.push({ title: `${section.title} · ${chart.title}`, caption: `${chart.finding} Source: ${config.sources[section.sourceKey].label}.`, headers: table.headers, rows: table.rows, chartPng: template === "annex" ? new Uint8Array() : await window.countryChartPng(chart) });
      }
      for (const table of section.tables) statistics.push({ title: `${section.title} · ${table.title}`, caption: `Source: ${config.sources[section.sourceKey].label}.`, headers: table.headers, rows: table.rows, chartPng: new Uint8Array() });
      if (section.resources) statistics.push({ title: section.title, caption: section.intro, headers: ["Resource", "Type", "Purpose"], rows: section.resources.map((item) => [item.title, item.type, item.description]), chartPng: new Uint8Array() });
    }
    if (template !== "brief") statistics.push({
      title: "Evidence manifest",
      caption: `Coverage and comparability reviewed before generation. Accessed ${dateTime.format(report.accessedAt)}.`,
      headers: ["Module", "Indicator", "Evidence type", "Unit", "Coverage / latest", "Comparability", "Status", "Known limitation"],
      rows: report.manifest.map((item) => [item.moduleLabel, item.indicatorLabel, item.evidenceType, item.unit, item.coverageText, item.comparability, item.statusLabel, item.limitation]),
      chartPng: new Uint8Array(),
    });
    const mapSections = report.sections.flatMap((section) => section.maps || []).filter((item) => item.available);
    if (template !== "annex") for (const item of mapSections) { const response = await fetch(item.path); if (response.ok) statistics.push({ title: `${item.country.name} cattle density`, caption: "GLW4 2020 · modelled head per km²", headers: [], rows: [], chartPng: new Uint8Array(await response.arrayBuffer()) }); }
    const selectedSections = template === "brief" ? statistics.slice(0, 6) : statistics;
    const peers = report.selection.comparisons.map((item) => item.name);
    const templateLabels = { brief: "Executive brief", technical: "Technical report", annex: "Evidence annex" };
    window.downloadCountryReport({
      title: peers.length ? `${report.selection.country.name} livestock profile with ${peers.join(" and ")}` : `${report.selection.country.name} livestock country profile`,
      subtitle: `${templateLabels[template]} · ${report.selection.purpose.label} · ${report.selection.start}–${report.selection.end} · ${report.selection.species.label}`,
      generatedDate: `Concept mockup generated ${dateTime.format(report.accessedAt)} from reviewed Livestock Hub responses`,
      findings: template === "annex" ? report.analysis.gaps.map((item) => `${item.title}: ${item.text}`) : report.findings,
      sections: selectedSections,
      sources: report.sources.map((source) => ({ label: source.label, url: source.url })),
      notes: ["This is an exploratory, semi-automated concept mockup, not an official FAO country report or publication.", "The structure, indicators, narrative, visual design, source mix and export formats can be further adjusted after technical and country review.", "EMPRES-i events are reported confirmed events and are not incidence rates; no records do not prove disease absence.", "Emissions are model outputs. Scenario analysis is intentionally separated from the historical profile.", "DAD-IS counts are national breed records and are not globally deduplicated breed counts."],
      filename: `${report.filename}-${template}`,
    });
    setExportStatus(`${templateLabels[template]} downloaded as an editable Word document.`);
  }

  function configurationPayload(selection = selectedContext()) {
    return {
      format: "livestock-country-report-configuration-v3",
      savedAt: new Date().toISOString(),
      purpose: selection.purpose.id,
      depth: selection.depth.id,
      emphasis: selection.emphasis.id,
      country: selection.country?.id || "",
      comparisons: selection.comparisons.map((item) => item.id),
      species: selection.species.id,
      start: selection.start,
      end: selection.end,
      modules: selection.modules,
      indicators: selection.indicators,
    };
  }

  function applyConfiguration(saved) {
    if (!saved || !saved.country) throw new Error("The saved configuration is incomplete.");
    dom.purpose.value = saved.purpose || config.purposes.find((item) => item.default)?.id || config.purposes[0].id;
    dom.depth.value = saved.depth || config.depths.find((item) => item.default)?.id || "standard";
    dom.emphasis.value = saved.emphasis || config.emphases.find((item) => item.default)?.id || "balanced";
    dom.country.value = saved.country;
    dom.comparison.value = saved.comparisons?.[0] || "";
    dom.comparison2.value = saved.comparisons?.[1] || "";
    dom.species.value = saved.species || "all";
    dom.startYear.value = String(saved.start || config.years.defaultStart);
    dom.endYear.value = String(saved.end || config.years.defaultEnd);
    $$('input[name="modules"]').forEach((input) => { input.checked = (saved.modules || []).includes(input.value); });
    $$('input[name="indicators"]').forEach((input) => { input.checked = (saved.indicators || []).includes(input.value); });
    loadedBundle = null;
    activeReport = null;
    clearRenderedReport();
    updateBlueprint();
  }

  function saveConfiguration() {
    const selection = selectedContext();
    const error = validateContext(selection, true);
    if (error) return setStatus(error, "error");
    try {
      localStorage.setItem("livestock-country-report-config-v3", JSON.stringify(configurationPayload(selection)));
      setStatus("Configuration saved in this browser. You can restore it with ‘Load last saved’. ", "success");
    } catch (error) {
      setStatus("This browser did not allow local configuration storage.", "error");
    }
  }

  function loadConfiguration() {
    try {
      const raw = localStorage.getItem("livestock-country-report-config-v3");
      if (!raw) return setStatus("No saved configuration was found in this browser.", "error");
      applyConfiguration(JSON.parse(raw));
      setStep(1);
      setStatus("The last saved configuration has been restored. Review it before retrieving data.", "success");
    } catch (error) {
      setStatus("The saved configuration could not be restored.", "error");
    }
  }

  async function withExportButton(button, label, action) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { await action(); } catch (error) { console.error(error); setStatus("The download could not be created. Please try again.", "error"); } finally { button.disabled = false; button.textContent = original; }
  }

  function selectionSignature(selection) {
    return JSON.stringify({
      country: selection.country?.id,
      comparisons: selection.comparisons.map((item) => item.id),
      species: selection.species.id,
      purpose: selection.purpose.id,
      depth: selection.depth.id,
      emphasis: selection.emphasis.id,
      modules: selection.modules,
      indicators: selection.indicators,
      start: selection.start,
      end: selection.end,
    });
  }

  async function ensureReport() {
    const selection = selectedContext();
    const error = validateContext(selection, true);
    if (error) {
      setStatus(error, "error");
      return null;
    }
    let bundle = loadedBundle;
    if (!bundle || selectionSignature(bundle.selection) !== selectionSignature(selection)) bundle = await loadSelection(selection);
    return buildReport(bundle);
  }

  function reset() {
    dom.form.reset();
    dom.country.value = "GHA";
    dom.comparison.value = "";
    dom.comparison2.value = "";
    dom.species.value = "all";
    dom.purpose.value = config.purposes.find((item) => item.default)?.id || config.purposes[0].id;
    dom.depth.value = config.depths.find((item) => item.default)?.id || "standard";
    dom.emphasis.value = config.emphases.find((item) => item.default)?.id || "balanced";
    dom.startYear.value = String(config.years.defaultStart);
    dom.endYear.value = String(config.years.defaultEnd);
    $$('input[name="modules"]').forEach((input) => { input.checked = Boolean(config.modules.find((module) => module.id === input.value)?.default); });
    $$('input[name="indicators"]').forEach((input) => {
      const module = config.modules.find((item) => item.id === input.dataset.module);
      const indicator = module?.indicators.find((item) => item.id === input.value);
      input.checked = Boolean(module?.default && indicator?.default !== false);
    });
    loadedBundle = null;
    activeReport = null;
    dom.review.replaceChildren();
    dom.reviewSummary.replaceChildren();
    dom.analysisDashboard.replaceChildren();
    dom.analysisSignals.replaceChildren();
    dom.analysisGaps.replaceChildren();
    dom.analysisDialogue.replaceChildren();
    clearRenderedReport();
    setStatus("");
    updateBlueprint();
    setStep(1);
  }

  function wireEvents() {
    dom.form.addEventListener("submit", (event) => event.preventDefault());
    dom.form.addEventListener("change", (event) => {
      if (event.target === dom.exportTemplate) return;
      if (event.target.matches('input[name="modules"]') && event.target.checked) {
        const indicators = $$(`input[name="indicators"][data-module="${event.target.value}"]`);
        if (!indicators.some((input) => input.checked)) indicators.forEach((input) => {
          const model = config.modules.find((item) => item.id === event.target.value)?.indicators.find((item) => item.id === input.value);
          input.checked = model?.default !== false;
        });
      }
      if (event.target.matches('input[name="indicators"]') && event.target.checked) {
        const moduleInput = $(`input[name="modules"][value="${event.target.dataset.module}"]`);
        if (moduleInput) moduleInput.checked = true;
      }
      loadedBundle = null;
      activeReport = null;
      clearRenderedReport();
      updateBlueprint();
    });
    dom.nextContext.addEventListener("click", () => { const selection = selectedContext(); const error = validateContext(selection); if (error) return setStatus(error, "error"); setStatus(""); setStep(2); });
    dom.nextModules.addEventListener("click", async () => { const selection = selectedContext(); const error = validateContext(selection, true); if (error) return setStatus(error, "error"); setStep(3); await loadSelection(selection); });
    dom.buildAnalysis.addEventListener("click", async () => {
      const report = await ensureReport();
      if (!report) return;
      renderAnalysis(report);
      setStatus("Analysis preview built from the reviewed evidence bundle.", "success");
    });
    dom.generate.addEventListener("click", async () => {
      const report = await ensureReport();
      if (!report) return;
      renderReport(report);
      setStatus("Full mockup report generated from the reviewed evidence bundle.", "success");
    });
    dom.reset.addEventListener("click", reset);
    dom.saveConfig.addEventListener("click", saveConfiguration);
    dom.loadConfig.addEventListener("click", loadConfiguration);
    $$('[data-back="context"]').forEach((button) => button.addEventListener("click", () => setStep(1)));
    $$('[data-back="modules"]').forEach((button) => button.addEventListener("click", () => setStep(2)));
    $$('[data-back="review"]').forEach((button) => button.addEventListener("click", () => setStep(3)));
    $$('[data-back="analysis"]').forEach((button) => button.addEventListener("click", () => setStep(4)));
    $$('[data-step]').forEach((button) => button.addEventListener("click", () => {
      const target = button.dataset.step;
      if (target === "context") return setStep(1);
      if (target === "modules") return setStep(2);
      if (target === "review" && loadedBundle) return setStep(3);
      if (target === "analysis" && activeReport && activeReport.id === loadedBundle?.id) return setStep(4);
      if (target === "report" && activeReport && activeReport.id === loadedBundle?.id && renderedReportId === activeReport.id) return setStep(5);
      setStatus("Complete the preceding step before opening this stage.", "error");
    }));
    dom.exportCsv.addEventListener("click", () => activeReport && exportCsv(activeReport));
    dom.exportJson.addEventListener("click", () => {
      if (!activeReport) return;
      download(new Blob([JSON.stringify(configurationPayload(activeReport.selection), null, 2)], { type: "application/json" }), `${activeReport.filename}-configuration.json`);
      setExportStatus("Report configuration record downloaded as JSON.");
    });
    dom.printReport.addEventListener("click", () => activeReport && window.print());
    dom.exportWord.addEventListener("click", () => activeReport && withExportButton(dom.exportWord, "Building Word…", () => exportWord(activeReport)));
  }

  function init() {
    Object.assign(dom, {
      form: $("#report-form"),
      country: $("#country"),
      comparison: $("#comparison"),
      comparison2: $("#comparison-2"),
      purpose: $("#report-purpose"),
      depth: $("#report-depth"),
      emphasis: $("#analytical-emphasis"),
      startYear: $("#start-year"),
      endYear: $("#end-year"),
      species: $("#species"),
      moduleOptions: $("#module-options"),
      nextContext: $("#next-context"),
      nextModules: $("#next-modules"),
      buildAnalysis: $("#build-analysis"),
      generate: $("#generate-report"),
      reset: $("#reset-settings"),
      saveConfig: $("#save-configuration"),
      loadConfig: $("#load-configuration"),
      status: $("#settings-status"),
      review: $("#data-review"),
      reviewSummary: $("#review-summary"),
      analysisDashboard: $("#analysis-dashboard"),
      analysisSignals: $("#analysis-signals"),
      analysisGaps: $("#analysis-gaps"),
      analysisDialogue: $("#analysis-dialogue"),
      reportTitle: $("#report-title"),
      reportMeta: $("#report-meta"),
      reportNavigation: $("#report-navigation"),
      summary: $("#summary"),
      charts: $("#charts"),
      sources: $("#sources-content"),
      exportTemplate: $("#export-template"),
      exportCsv: $("#export-csv"),
      exportJson: $("#export-json"),
      printReport: $("#print-report"),
      exportWord: $("#export-word"),
      exportStatus: $("#export-status"),
    });
    const missing = Object.entries(dom).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) throw new Error(`Missing UI elements: ${missing.join(", ")}`);
    populateControls();
    renderModuleOptions();
    wireEvents();
    updateBlueprint();
    setStep(1);
  }

  init();
})();
