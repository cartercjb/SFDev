const fs = require('fs-extra');
const glob = require('fast-glob');
const css = require('css');
const { readFileSync } = require('fs-extra');

const { filterObject } = require('../shared/utils/objects');
const { compileModularCSS } = require('./compile/modular-css');
const { propTypes } = require('./var-metadata');

/**
 * Parses through generated modular CSS files and extracts vars
 */
const extractVarsFromSLDS = (props = {}) => {
  const { callback, suppressOutput } = props;
  const cssFolderExists = fs.existsSync('./.generated/css');
  const varsAllowPattern = /^--slds-c/;

  // if there's no css folder yet, generate it!
  if (!cssFolderExists) {
    compileModularCSS({ suppressOutput });
  }

  // logging
  if (!suppressOutput) {
    console.log('=> Clearing out Metadata');
  }
  fs.emptyDirSync('.generated/metadata');

  // getting list of components and utilities to parse
  const componentList = fs
    .readdirSync('./.generated/css/components')
    .map(name => `./.generated/css/components/${name}/**/index.css`);
  const utilityList = fs
    .readdirSync('./.generated/css/utilities')
    .map(name => `./.generated/css/utilities/${name}/**/index.css`);

  // parse through all variants of each component / util
  componentList.concat(utilityList).map(fileGlob => {
    const cssFiles = glob.sync(fileGlob);
    let varsData = {};

    cssFiles.map(filename => {
      const cssContent = readFileSync(filename).toString();
      const fileVars = extractVarsFromCSS(cssContent, {
        allowPattern: varsAllowPattern
      });

      if (Object.keys(fileVars).length > 0) {
        varsData = Object.assign(fileVars, varsData);
      }
    });

    if (Object.keys(varsData).length > 0) {
      const fileParts = fileGlob.match(/generated\/css\/(.*?)\/(.*?)\//);
      const itemType = fileParts[1];
      const itemName = fileParts[2];
      const outFile = `./.generated/metadata/${itemType}/${itemName}/styling-hooks.json`;

      fs.ensureFile(outFile, () => {
        fs.writeFileSync(outFile, JSON.stringify(varsData), 'utf8');
      });
    }
  });

  if (callback) callback();
};

/**
 * Extracts CSS vars and their fallback values from a CSS string and
 * returns it as an object
 * @param {string} cssData
 * @returns {object}
 */
const extractVarsFromCSS = (cssContent, options = {}) => {
  const ast = css.parse(cssContent);
  const rules = ast.stylesheet.rules.filter(rule => rule.type === 'rule');
  const { allowPattern } = options;
  let list = {};

  rules.map(rule => {
    const filtered = rule.declarations.filter(dec => {
      if (!dec.value) return false;

      // match on var values that are not custom props
      if (dec.value.match(/var\(/) && !dec.property.match(/^--/)) {
        return true;
      }

      return false;
    });

    if (filtered.length > 0) {
      const vars = rule.declarations
        .filter(dec => (dec.value ? dec.value.match(/var\(/) : false))
        .map(dec => {
          const cssVar = dec.value.match(/(--.*?)[,|)]/)[1];
          const fallbackMatch = dec.value.match(/,\s(.*)\)/);
          const fallback = fallbackMatch ? fallbackMatch[1] : '';

          return {
            [cssVar]: fallback
          };
        });

      vars.forEach(cssVar => {
        const varName = Object.keys(cssVar)[0];
        if (varName) {
          const categories = Object.keys(propTypes);

          const matchedCategory = categories.find(option => {
            if (varName.includes(option)) {
              return option;
            }
          });

          list[varName] = { fallbackValue: cssVar[varName] };

          if (matchedCategory) {
            list[varName].category = propTypes[matchedCategory].type;
            list[varName].valueType = propTypes[
              matchedCategory
            ].valueTypes.join('');
          }
        }
      });
    }
  });

  return allowPattern
    ? filterObject(list, key => RegExp(allowPattern).test(key))
    : list;
};

module.exports = {
  extractVarsFromCSS,
  extractVarsFromSLDS
};
