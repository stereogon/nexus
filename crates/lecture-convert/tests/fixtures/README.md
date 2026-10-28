# Conversion fixtures

Real documents, small enough to read, built here rather than downloaded — the repository
needs no network to reproduce any of them.

## `minimal.docx`

A genuine Office Open XML package: `[Content_Types].xml`, `_rels/.rels` and
`word/document.xml` in a zip. Generated from literal XML, so every byte of its content is
reviewable as text.

## `minimal.pptx` and `minimal.fodp`

`minimal.fodp` is flat ODF — a presentation as a single XML file, which is why it is the
*source* rather than a hand-built `.pptx`. A minimal valid OOXML presentation needs a slide
master, a layout and their relationships; flat ODF needs one `<draw:page>`.

`minimal.pptx` was produced from it by `LibreOffice` 26.8.1.1:

```sh
soffice -env:UserInstallation=file:///<a temp profile> \
        --headless --convert-to pptx --outdir <out> minimal.fodp
```

**What this fixture does and does not establish.** It is a real 14-part PowerPoint package
and it exercises the Impress import filter and the `pptx` → `pdf` path, which the `.docx`
fixture does not. But it was *written* by `LibreOffice`, so converting it proves
`LibreOffice` reads its own output — not that it reads what `PowerPoint` writes. A deck
saved by `PowerPoint` or Keynote would be strictly better evidence and is not here because
obtaining one needs either that software or a download. Stated rather than left for someone
to assume.
