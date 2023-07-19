export type DateInput = string | number | Date;

export const isDate = (date: any): date is Date => {
  return date instanceof Date && !isNaN(date.getTime());
};

export const createDate = (input: DateInput) => {
  const date = new Date(input);
  if (!isDate(date)) throw new Error("Invalid date");
  return date;
};
