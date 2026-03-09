export const normalizeStudentStatus = (status) => {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
};

export const isStudentDroppedOut = (status) => {
  const normalized = normalizeStudentStatus(status);
  return normalized === 'dropped' || normalized === 'dropped_out' || normalized === 'dropout';
};
