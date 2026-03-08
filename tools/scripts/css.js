export function getAllCSSVariables() {
    const variables = [];
    const sheets = document.styleSheets;

    for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];

        try {
            // Get all CSS rules in the stylesheet
            const rules = sheet.cssRules || sheet.rules;

            for (let j = 0; j < rules.length; j++) {
                const rule = rules[j];

                // Check if it's a style rule
                if (rule instanceof CSSStyleRule) {
                    const style = rule.style;

                    // Iterate through all style properties
                    for (let k = 0; k < style.length; k++) {
                        const prop = style[k];

                        // Check if it's a CSS variable
                        if (prop.startsWith('--')) {
                            variables.push({
                                name: prop,
                                value: style.getPropertyValue(prop).trim(),
                                source: `${sheet.href || 'inline'} - ${rule.selectorText}`
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Cannot read stylesheet:', sheet.href, e);
        }
    }

    return variables;
};