const REQUIRED_COMMAND_FIELDS = Object.freeze([
  "id",
  "title",
  "triggers",
  "execution_mode"
]);

const DEPRECATED_COMMAND_FIELDS = Object.freeze([
  "members"
]);

function isValidRequiredCommandField(field, value) {
  if (field === "triggers") {
    return Array.isArray(value) && value.length > 0 &&
      value.every((item) => typeof item === "string" && item.trim().length > 0);
  }
  if (field === "execution_mode") {
    return ["sequential", "hybrid"].includes(value);
  }
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
  DEPRECATED_COMMAND_FIELDS,
  isValidRequiredCommandField,
  REQUIRED_COMMAND_FIELDS
};
