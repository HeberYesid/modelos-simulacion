# Academic report revision and presentation verification

Date: 2026-10-24. The authorized H07 revision was written to a separate updated DOCX in the academic workspace. The original academic report and historical findings report remain unchanged.

## Content and preservation

- Updated 48 original paragraphs and two table cells, retaining the existing research question, bibliography and declared scope of the study.
- Added implementation/engineering evidence, the descriptive comparison of both visits, and the pending calibration, validation and experiment stages.
- Distinguished station records, orders and people; restricted confirmed joins to the eight orders observed on 2026-10-23; retained the unresolved Tuesday overlap and unknown active/pause durations.
- Described version 1 and the version-2 extension separately. At this checkpoint the extension remains under integration acceptance; no completed UI/replay or empirical-validity claim was added.
- Preserved the original section geometry, two embedded image parts byte for byte, and the original source document hash.
- Kept unknown cover information explicit: surnames, any coauthors, academic program, teacher and delivery date were not invented.

Original source SHA-256:

```text
7629ae302af295bf02f3d9cf0f680343db93f0fd9bd4527322b3960decce3e21
```

Updated DOCX SHA-256 at this checkpoint:

```text
af031ff02d46e87face2ce4e80b4babc728b95efb00b0568a623c8afd393daf7
```

The final artifact hash and layout/preservation checks are recorded in [academic-document-manifest.json](academic-document-manifest.json).

## Native fields and visual QA

The table of contents and page references were refreshed with local Microsoft Word. The packaged document renderer produced page images and an internal PDF. The last reviewed render is `academic-update-qa-8` in this chat's visualization directory, containing 27 pages.

Every final page was inspected or confirmed byte-identical to a clean page image already inspected in this same revision. Checks included the cover, the two-page contents table, the main body, both original diagrams, the complete comparison table, references and appendices. Iteration corrected a blank-page transition, table width, split rows and inconsistent typography in newly added headings. The final PDF had no blank pages; its minimum page text length was 313 characters. This structural check supplements the visual inspection.

The final layout places the comparison table on page 22, references on page 25, Appendix A on page 26 and Appendix B on page 27. The contents table was checked against those rendered headings. Images and the intermediate PDF are QA artifacts rather than additional deliverables.

This revision documents observed software checks and source observations. It does not add field measurements, fitted parameters, operator approval or independent human installation acceptance.
