export type InterestType = "english" | "math" | "korean" | "etc";

export type PreferTimeType = "09-12" | "12-18" | "18-21" | "all";

export type FormActionType =
  | { type: "CHANGE_EMAIL"; value: string }
  | { type: "CHANGE_NAME"; value: string }
  | { type: "CHANGE_INTERESTS"; value: InterestType[] }
  | { type: "CHANGE_PREFER_TIME"; value: PreferTimeType[] };

export type FormType = {
  email: string;
  name: string;
  interests: InterestType[];
  preferTime: PreferTimeType[];
};

export const initialForm: FormType = {
  email: "",
  name: "",
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
    case "CHANGE_INTERESTS":
      return {
        ...form,
        interests: action.value,
      };
    case "CHANGE_PREFER_TIME":
      return {
        ...form,
        preferTime: action.value,
      };
    default:
      return {
        ...form,
      };
  } // end of switch
};
