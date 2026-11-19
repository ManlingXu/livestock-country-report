(function () {
  "use strict";

  const officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const documentMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const textEncoder = new TextEncoder();
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    let result = value;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result >>> 1) ^ (result & 1 ? 0xEDB88320 : 0);
    }
    return result >>> 0;
  });

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function run(text, properties = "") {
    return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  }

  function paragraph(text, style = "") {
    const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
    return `<w:p>${properties}${run(text)}</w:p>`;
  }

  function makeTable(headers, rows) {
    if (!headers.length) return "";

    const tableWidth = 9360;
    const columnWidth = Math.floor(tableWidth / headers.length);
    const makeRow = (values, isHeader) => {
      const rowProps = isHeader ? "<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>";
      const cells = headers.map((_, index) => {
        const cellProps = `<w:tcW w:w="${columnWidth}" w:type="dxa"/>${isHeader ? '<w:shd w:val="clear" w:fill="E3EFEB"/>' : ""}`;
        const value = run(values[index], isHeader ? "<w:rPr><w:b/></w:rPr>" : "");
        return `<w:tc><w:tcPr>${cellProps}</w:tcPr><w:p><w:pPr><w:pStyle w:val="ReportCell"/></w:pPr>${value}</w:p></w:tc>`;
      }).join("");
      return `<w:tr>${rowProps}${cells}</w:tr>`;
    };
    const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map(
      edge => `<w:${edge} w:val="single" w:sz="5" w:color="CFDBD6"/>`
    ).join("");
    const grid = headers.map(() => `<w:gridCol w:w="${columnWidth}"/>`).join("");
    return `<w:tbl>
      <w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/>
      <w:tblCellMar><w:top w:w="68" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="68" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>
      <w:tblGrid>${grid}</w:tblGrid>${makeRow(headers, true)}${rows.map(row => makeRow(row, false)).join("")}
    </w:tbl>`;
  }

  function chartDrawing(png, id, title) {
    const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!(png instanceof Uint8Array) || png.length < 24 || !pngHeader.every((byte, index) => png[index] === byte)) {
      return "";
    }
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height) return "";

    const scale = Math.min(5943600 / width, 2286000 / height);
    const cx = Math.round(width * scale);
    const cy = Math.round(height * scale);
    return `<w:p><w:pPr><w:spacing w:after="140"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Chart ${id}" descr="${escapeXml(title)}"/>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Chart ${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rIdChart${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData></a:graphic>
      </wp:inline></w:drawing></w:r></w:p>`;
  }

  const styles = `${xmlDeclaration}<w:styles xmlns:w="${wordNamespace}">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos" w:cs="Aptos"/><w:color w:val="182620"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="135" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
    <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="130"/></w:pPr><w:rPr><w:b/><w:color w:val="172C24"/><w:sz w:val="48"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="85"/></w:pPr><w:rPr><w:color w:val="36574A"/><w:sz w:val="25"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="300" w:after="90"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="172C24"/><w:sz w:val="30"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="120"/></w:pPr><w:rPr><w:color w:val="42544D"/><w:sz w:val="20"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="ReportFinding"><w:name w:val="Report finding"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="260" w:hanging="260"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="ReportCell"><w:name w:val="Report cell"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
  </w:styles>`;

  function relationships(entries) {
    return `${xmlDeclaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.join("")}</Relationships>`;
  }

  function relation(id, type, target, external = false) {
    const targetMode = external ? ' TargetMode="External"' : "";
    return `<Relationship Id="${id}" Type="${officeRelationships}${type}" Target="${escapeXml(target)}"${targetMode}/>`;
  }

  function createWordParts(model) {
    const media = [];
    const documentRelationships = [relation("rIdStyles", "styles", "styles.xml")];
    const sections = model.sections.map((section, index) => {
      const id = index + 1;
      const chart = chartDrawing(section.chartPng, id, section.title);
      if (chart) {
        media.push([`word/media/chart-${id}.png`, section.chartPng]);
        documentRelationships.push(relation(`rIdChart${id}`, "image", `media/chart-${id}.png`));
      }
      return paragraph(section.title, "Heading1")
        + (section.caption ? paragraph(section.caption, "Caption") : "")
        + chart
        + makeTable(section.headers, section.rows);
    }).join("");
    const sources = model.sources.map((source, index) => {
      let url;
      try {
        url = new URL(source.url);
      } catch {
        return paragraph(source.label);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return paragraph(source.label);
      const id = `rIdSource${index + 1}`;
      documentRelationships.push(relation(id, "hyperlink", url.href, true));
      return `<w:p><w:hyperlink r:id="${id}">${run(source.label, '<w:rPr><w:color w:val="236956"/><w:u w:val="single"/></w:rPr>')}</w:hyperlink></w:p>`;
    }).join("");
    const document = `${xmlDeclaration}<w:document xmlns:w="${wordNamespace}" xmlns:r="${officeRelationships.slice(0, -1)}"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        ${paragraph(model.title, "Title")}
        ${model.subtitle ? paragraph(model.subtitle, "Subtitle") : ""}
        ${model.generatedDate ? paragraph(model.generatedDate) : ""}
        ${model.findings.length ? paragraph("Key findings", "Heading1") : ""}
        ${model.findings.map(finding => paragraph(`•  ${finding}`, "ReportFinding")).join("")}
        ${sections}
        ${sources ? paragraph("Data sources", "Heading1") + sources : ""}
        ${model.notes.length ? paragraph("Notes", "Heading1") + model.notes.map(note => paragraph(note)).join("") : ""}
        <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="620" w:footer="620" w:gutter="0"/></w:sectPr>
      </w:body></w:document>`;
    const types = `${xmlDeclaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`;
    return [
      ["[Content_Types].xml", types],
      ["_rels/.rels", relationships([relation("rIdDocument", "officeDocument", "word/document.xml")])],
      ["word/document.xml", document],
      ["word/styles.xml", styles],
      ["word/_rels/document.xml.rels", relationships(documentRelationships)],
      ...media,
    ];
  }

  function crc32(bytes) {
    let checksum = 0xFFFFFFFF;
    for (const byte of bytes) {
      checksum = (checksum >>> 8) ^ crcTable[(checksum ^ byte) & 0xff];
    }
    return (checksum ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(entries) {
    let fileOffset = 0;
    let directorySize = 0;
    const files = [];
    const directory = [];
    for (const [name, content] of entries) {
      const filename = textEncoder.encode(name);
      const data = typeof content === "string" ? textEncoder.encode(content) : content;
      const checksum = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(12, 0x21, true);
      local.setUint32(14, checksum, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, filename.length, true);
      files.push(local.buffer, filename, data);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(14, 0x21, true);
      central.setUint32(16, checksum, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, filename.length, true);
      central.setUint32(42, fileOffset, true);
      directory.push(central.buffer, filename);

      fileOffset += local.byteLength + filename.length + data.length;
      directorySize += central.byteLength + filename.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, fileOffset, true);
    return new Blob([...files, ...directory, end.buffer], { type: documentMime });
  }

  window.downloadCountryReport = function (model) {
    const blob = zip(createWordParts(model));
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = String(model.filename || "livestock-country-report")
      .replace(/\.docx$/i, "").replace(/[<>:"/\\|?*]/g, "-");
    link.href = objectUrl;
    link.download = `${baseName}.docx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
}());
