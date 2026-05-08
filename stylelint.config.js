export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    "assets/**",
    "build/**",
    "dist/**",
    "node_modules/**",
    "out/**",
  ],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "apply",
          "config",
          "custom-variant",
          "layer",
          "plugin",
          "source",
          "theme",
          "tailwind",
          "utility",
          "variant",
        ],
      },
    ],
    "custom-property-pattern": null,
    "keyframes-name-pattern": null,
    "selector-class-pattern": null,
  },
};
