import i18n from '../../i18n/config';

type Vars = Record<string, unknown>;

export type FeatureTFunction = (
  key: string,
  defaultOrVars?: string | Record<string, unknown>,
  maybeVars?: Record<string, unknown>,
) => string;

/**
 * Shared `t()` for feature modules that still import a local helper instead of
 * `useTranslation()`. Always resolves against the active i18next locale.
 */
export const featureT: FeatureTFunction = (key, defaultOrVars, maybeVars) => {
  let defaultStr: string | undefined;
  let vars: Vars | undefined;
  if (typeof defaultOrVars === 'string') {
    defaultStr = defaultOrVars;
    vars = maybeVars;
  } else if (defaultOrVars && typeof defaultOrVars === 'object') {
    vars = { ...defaultOrVars };
    if (typeof vars.defaultValue === 'string') {
      defaultStr = vars.defaultValue;
      delete vars.defaultValue;
    }
  }

  if (defaultStr !== undefined) {
    return i18n.t(key, { ...(vars || {}), defaultValue: defaultStr });
  }
  return i18n.t(key, vars);
};
