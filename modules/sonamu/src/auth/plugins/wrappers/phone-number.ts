import { phoneNumber as _phoneNumber, type PhoneNumberOptions } from "better-auth/plugins";
import { merge } from "../../../utils/utils";

export type { PhoneNumberOptions } from "better-auth/plugins";

/**
 * Phone Number 플러그인 스키마
 *
 * better-auth phoneNumber 플러그인 호출 시 전달합니다:
 * ```typescript
 * phoneNumber({ schema: PHONE_NUMBER_SCHEMA })
 * ```
 */
export const PHONE_NUMBER_SCHEMA: PhoneNumberOptions["schema"] = {
  user: {
    fields: {
      phoneNumber: "phone_number",
      phoneNumberVerified: "phone_number_verified",
    },
  },
};

/**
 * phoneNumber 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const phoneNumber = (options: PhoneNumberOptions) => {
  options.schema = merge(PHONE_NUMBER_SCHEMA, options.schema ?? {});
  return _phoneNumber(options);
};
