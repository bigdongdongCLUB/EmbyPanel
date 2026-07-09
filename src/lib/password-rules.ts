export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

export function passwordRuleText(strongPassword: boolean) {
  return strongPassword
    ? "8-20位，且包含小写字母、大写字母和数字"
    : "8-20位";
}

export function getPasswordRuleErrors(password: string, strongPassword: boolean) {
  const list: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    list.push("密码必须为8-20位");
  }
  if (strongPassword) {
    if (!/[a-z]/.test(password)) list.push("密码必须包含小写字母");
    if (!/[A-Z]/.test(password)) list.push("密码必须包含大写字母");
    if (!/[0-9]/.test(password)) list.push("密码必须包含数字");
  }
  return Array.from(new Set(list));
}

export function validatePasswordRules(password: string, strongPassword: boolean) {
  return getPasswordRuleErrors(password, strongPassword).length === 0;
}

export function passwordRuleErrorCode(password: string, strongPassword: boolean) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return "password_invalid_length";
  if (strongPassword && (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password))) return "weak_password";
  return null;
}
