const VN_MOBILE = /^(0|\+84)[0-9]{9}$/;

export const isValidVnPhone = (value: string) => VN_MOBILE.test(value.trim());

export const normalizeVnPhone = (value: string) => {
  const v = value.trim();
  return /^\+84[0-9]{9}$/.test(v) ? `0${v.slice(3)}` : v;
};
