import format from "../../data-format.json";

export const DATA_MODEL_VERSION = format.dataModel;

/** Check both markers: older desktop files only stored company.modelVersion. */
export function assertSupportedDataModel(state: {
  dataModel?: number;
  company: { modelVersion?: number };
}): void {
  for (const version of [state.dataModel, state.company.modelVersion]) {
    if (
      version !== undefined &&
      (!Number.isInteger(version) ||
        version < 1 ||
        version > DATA_MODEL_VERSION)
    ) {
      throw new Error("incompatibleDatabase");
    }
  }
}
