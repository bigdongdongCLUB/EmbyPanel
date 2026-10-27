const messages: Record<string, string> = {
  order_not_found: "订单不存在",
  stripe_payment_in_progress: "Stripe 支付尚未结束，请返回收银台或等待支付结果",
  stripe_method_unavailable: "该支付方式暂不可用，请联系管理员",
  stripe_checkout_failed: "无法创建 Stripe 收银台，请稍后重试或联系管理员检查配置",
  stripe_attempt_closed_recreate: "该收银台已结束，请取消并重新创建订单，或使用账户余额支付",
  stripe_zero_amount_use_balance: "零元订单请使用余额方式完成",
  stripe_payment_review: "支付结果需要管理员核对，请勿重复付款",
  unauthorized: "登录已过期，请重新登录",
  order_price_changed_recreate: "订单价格或时长已变更，请取消该订单后重新下单",
  plan_not_available: "该订阅计划当前不可购买",
  plan_cycle_not_available: "该支付周期当前不可购买",
  trial_not_available: "当前账号不符合试用条件",
  user_disabled: "账号已停用，无法支付",
  insufficient_balance: "账户余额不足",
  balance_covers_order_use_balance: "余额已足够支付全单，请选择账户余额支付",
  order_expired: "订单已过期，请重新下单",
  order_not_pending: "订单已取消或已过期，请重新下单",
  payment_failed: "支付暂时无法完成，请稍后重试",
};

export function paymentErrorText(code: string) {
  return messages[code] ?? code;
}

export const PAYMENT_SYNC_WARNING = "支付已成功，服务器同步暂未完成，请勿重复付款，请联系管理员检查开通状态。";
