export type InterestType = "english" | "math" | "korean" | "etc";
export type PreferTimeType = "09-12" | "12-18" | "18-21" | "all";

export type TextInfoType = "name" | "email" | "tel";
export type TextInputType = "text" | "email" | "tel";

// FIXME: make iterable obj for TextInput.tsx
export const textInputMap: Record<TextInfoType, TextInputType> = { name: "text", email: "email", tel: "tel" };

export type FormActionType =
  | { type: "CHANGE_EMAIL"; value: string }
  | { type: "CHANGE_NAME"; value: string }
  | { type: "CHANGE_TEL"; value: string }
  | { type: "CHANGE_INTERESTS"; value: InterestType[] }
  | { type: "CHANGE_PREFER_TIME"; value: PreferTimeType[] };

export type FormType = {
  email: string;
  name: string;
  tel: string;
  interests: InterestType[];
  preferTime: PreferTimeType[];
};

export const initialForm: FormType = {
  email: "",
  name: "",
  tel: "",
  interests: [],
  preferTime: [],
};

export const formReducer = (form: FormType, action: FormActionType): FormType => {
  switch (action.type) {
    case "CHANGE_EMAIL":
      return {
        ...form,
        email: action.value,
      };
    case "CHANGE_NAME":
      return {
        ...form,
        name: action.value,
      };
    case "CHANGE_TEL":
      return {
        ...form,
        tel: action.value,
      };
    case "CHANGE_INTERESTS":
      return {
        ...form,
        // TODO: implement arr type
      };
    case "CHANGE_PREFER_TIME":
      return {
        ...form,
        // TODO: implement arr type
      };
    default:
      return {
        ...form,
      };
  } // end of switch
};
