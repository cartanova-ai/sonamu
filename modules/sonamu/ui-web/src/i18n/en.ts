/**
 * Sonamu UI English Dictionary
 */
import type ko from "./ko";

type DictKey = keyof typeof ko;

const en: Record<DictKey, any> = {
  // react-components i18n keys (English)
  "rc.asyncSelect.loading": "Loading...",
  "rc.asyncSelect.noOptions": "No options",
  "rc.asyncSelect.noResults": "No results",
  "rc.asyncSelect.selectPlaceholder": "Select...",

  "rc.combobox.noResults": "No results",
  "rc.combobox.selectPlaceholder": "Select...",

  "rc.datePicker.pickDate": "Pick date",
  "rc.datePicker.placeholder": "Pick date",
  "rc.datePicker.selectDate": "Select date",

  "rc.dateSelectorMultiple.addDate": "Add date",
  "rc.dateSelectorMultiple.dateRange": "Range",
  "rc.dateSelectorMultiple.placeholder": "Pick date",
  "rc.dateSelectorMultiple.singleDate": "Single",

  "rc.fileInput.browseFiles": "Browse files",
  "rc.fileInput.dropZone": "Drag files here or click to upload",
  "rc.fileInput.filePlaceholder": "File",
  "rc.fileInput.imagePlaceholder": "Image",
  "rc.fileInput.maxFilesExceeded": (maxFiles: number) => `Maximum ${maxFiles} files allowed`,
  "rc.fileInput.pending": "Pending",
  "rc.fileInput.remove": "Remove",
  "rc.fileInput.uploadFailed": "Upload failed",
  "rc.fileInput.uploading": "Uploading...",

  "rc.monthPickerMultiple.addMonth": "Add month",
  "rc.monthPickerMultiple.dateRange": "Range",
  "rc.monthPickerMultiple.endDate": "End date",
  "rc.monthPickerMultiple.placeholder": "Pick month",
  "rc.monthPickerMultiple.singleDate": "Single",
  "rc.monthPickerMultiple.startDate": "Start date",

  "rc.multiSelect.clear": "Clear all",
  "rc.multiSelect.close": "Close",
  "rc.multiSelect.moreItems": (count: number) => `+${count} more`,
  "rc.multiSelect.noOptions": "No options",
  "rc.multiSelect.noOptionsSelected": "No options selected",
  "rc.multiSelect.noResults": "No results",
  "rc.multiSelect.optionsCount": (count: number) => `${count} options`,
  "rc.multiSelect.selectAll": "Select all",
  "rc.multiSelect.selectPlaceholder": "Select...",

  "rc.pagination.next": "Next",
  "rc.pagination.previous": "Previous",
  "rc.pagination.showing": (start: number, end: number, total: number) =>
    `Showing ${start}-${end} of ${total}`,

  "rc.calendar.month.0": "January",
  "rc.calendar.month.1": "February",
  "rc.calendar.month.2": "March",
  "rc.calendar.month.3": "April",
  "rc.calendar.month.4": "May",
  "rc.calendar.month.5": "June",
  "rc.calendar.month.6": "July",
  "rc.calendar.month.7": "August",
  "rc.calendar.month.8": "September",
  "rc.calendar.month.9": "October",
  "rc.calendar.month.10": "November",
  "rc.calendar.month.11": "December",

  // Common
  "rc.common.cancel": "Cancel",
  "rc.common.save": "Save",

  // Sonamu UI keys
  // Navigation
  "nav.entities": "Entities",
  "nav.migration": "DB Migration",
  "nav.scaffolding": "Scaffolding",
  "nav.fixture": "Fixture",
  "nav.i18n": "i18n",
  "nav.search": "Search",

  // Common Actions
  "common.create": "Create",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.preview": "Preview",
  "common.refresh": "Refresh",
  "common.apply": "Apply",
  "common.add": "Add",
  "common.remove": "Remove",
  "common.select": "Select",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.success": "Success",
  "common.all": "All",
  "common.none": "None",
  "common.yes": "Yes",
  "common.no": "No",
  "common.generate": "Generate",
  "common.overwrite": "Overwrite",

  // Common Labels
  "common.name": "Name",
  "common.type": "Type",
  "common.table": "Table",
  "common.column": "Column",
  "common.status": "Status",
  "common.description": "Description",
  "common.code": "Code",
  "common.id": "ID",
  "common.total": "Total",
  "common.items": "items",
  "common.path": "Path",

  // Entity
  "entity.new": "New Entity",
  "entity.title": "Entity: {id}",
  "entity.parentId": "ParentID",
  "entity.tableName": "TableName",
  "entity.props": "Props",
  "entity.indexes": "Indexes",
  "entity.subsets": "Subsets",
  "entity.enums": "Enums",
  "entity.addProp": "Add a prop",
  "entity.addIndex": "Add a index",
  "entity.confirm.delete": 'Delete "{id}" Entity?',
  "entity.confirm.deleteProp": 'Delete "{name}" property?',
  "entity.confirm.deleteIndex": "Delete this index?",
  "entity.confirm.deleteSubset": 'Delete "{key}" subset?',
  "entity.confirm.deleteEnum": 'Delete "{id}" Enum?',
  "entity.prompt.subsetKey": "Subset key?",
  "entity.prompt.newEnumId": "New enum id?",
  "entity.prompt.changeEnumId": "Change EnumID?",

  // Entity Props Table
  "entity.prop.name": "Name",
  "entity.prop.desc": "Desc",
  "entity.prop.type": "Type",
  "entity.prop.nullable": "Nullable",
  "entity.prop.withAs": "With/As",
  "entity.prop.default": "Default",
  "entity.prop.filter": "Filter",

  // Entity Index Table
  "entity.index.type": "Type",
  "entity.index.columns": "Columns",

  // Migration
  "migration.preparedCodes": "Prepared Migration Codes",
  "migration.codeFiles": "Migration Code Files",
  "migration.toggleCodes": "Toggle codes",
  "migration.generate": "Generate",
  "migration.deleteCodes": "Delete codes",
  "migration.applyToLatest": "Apply to Latest",
  "migration.rollback": "Rollback",
  "migration.noPreparedCodes": "No prepared migration codes.",
  "migration.noCodeFiles": "No migration code files",
  "migration.codeCollapsed": "Code is collapsed",
  "migration.confirm.deleteCodes": "Are you sure to delete the selected {count} migration codes?",
  "migration.error.connections":
    "Some connections are in error state. Please check the connection settings and try again.",
  "migration.status.pending": "PENDING",
  "migration.status.applied": "APPLIED",
  "migration.status.error": "ERROR",

  // Scaffolding
  "scaffolding.entities": "Entities",
  "scaffolding.checkAllEntities": "Check all entities",
  "scaffolding.uncheckAllEntities": "Uncheck all entities",
  "scaffolding.template": "Template: {name}",
  "scaffolding.checkAll": "Check all",
  "scaffolding.uncheckAll": "Uncheck all",
  "scaffolding.enums": "Enums",
  "scaffolding.checkAllEnums": "Check all enums",
  "scaffolding.uncheckAllEnums": "Uncheck all enums",
  "scaffolding.selectPrompt": "Please select EntityIDs / TemplateKeys to generate",
  "scaffolding.selectPromptWithEnums": " / EnumIDs",
  "scaffolding.generateTemplates": "Generate {count} template(s) — {overwriteCount} overwrite",
  "scaffolding.isExists": "IsExists",
  "scaffolding.noPreviewData": "No preview data available",
  "scaffolding.previewTitle": "Preview",
  "scaffolding.previewDesc": "Preview of generated code files",

  // Fixture
  "fixture.title": "Fixture",
  "fixture.records": "Records",
  "fixture.code": "Code",
  "fixture.searchSettings": "Search Settings",
  "fixture.selectSourceDb": "Select source DB",
  "fixture.selectEntity": "Select entity",
  "fixture.selectColumn": "Select column",
  "fixture.inputSearchValue": "Enter search value",
  "fixture.search": "Search",
  "fixture.saveSettings": "Save DB Settings",
  "fixture.selectTargetDb": "Select target DB",
  "fixture.itemsToSave": "{count} items to save",
  "fixture.fixtureList": "Fixtures to save",
  "fixture.new": "New",
  "fixture.overwrite": "Overwrite",
  "fixture.graphView": "Graph View",
  "fixture.tableView": "Table View",
  "fixture.recordViewer": "Fixture Record Viewer",
  "fixture.codeViewer": "Fixture Code Viewer",

  // i18n Page
  "i18n.title": "i18n",
  "i18n.addKey": "Add Key",
  "i18n.exportExcel": "Export Excel",
  "i18n.importExcel": "Import Excel",
  "i18n.checkUsage": "Check Usage",
  "i18n.totalKeys": "Total: {count} keys",
  "i18n.source": "Source",
  "i18n.key": "Key",
  "i18n.completion": "Completion",
  "i18n.editHint": "Double-click on a cell to edit. Press Enter to save, Escape to cancel.",
  "i18n.confirm.delete": 'Delete "{key}" key?',
  "i18n.modal.addNewKey": "Add New Key",
  "i18n.modal.valueFor": "Value for {locale}",
  "i18n.creating": "Creating...",
};

export default en;
