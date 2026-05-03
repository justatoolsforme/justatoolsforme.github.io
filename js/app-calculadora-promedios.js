'use strict';

document.addEventListener('DOMContentLoaded', function() {
  initAverageCalculator({
    buttonId: 'calc-promedio-btn',
    inputIds: ['calc-monto-a', 'calc-monto-b', 'calc-monto-c'],
    resultId: 'calc-promedio-result',
    sumId: 'calc-promedio-suma',
    valueId: 'calc-promedio-valor',
    divisor: 3,
    emptyMessage: 'Por favor ingresa al menos un monto',
    successMessage: 'Promedio calculado correctamente'
  });

  initAverageCalculator({
    buttonId: 'calc-promedio6-btn',
    inputIds: [
      'calc6-monto-a',
      'calc6-monto-b',
      'calc6-monto-c',
      'calc6-monto-d',
      'calc6-monto-e',
      'calc6-monto-f'
    ],
    resultId: 'calc-promedio6-result',
    sumId: 'calc-promedio6-suma',
    valueId: 'calc-promedio6-valor',
    divisor: 6,
    emptyMessage: 'Por favor ingresa al menos un monto para el promedio de 6',
    successMessage: 'Promedio de 6 calculado correctamente'
  });

  function initAverageCalculator(config) {
    const button = document.getElementById(config.buttonId);
    const inputs = config.inputIds.map(id => document.getElementById(id)).filter(Boolean);
    const result = document.getElementById(config.resultId);
    const sumOutput = document.getElementById(config.sumId);
    const valueOutput = document.getElementById(config.valueId);

    if (!button || inputs.length !== config.inputIds.length || !result || !sumOutput || !valueOutput) {
      return;
    }

    button.addEventListener('click', function() {
      const values = inputs.map(input => parseFloat(input.value) || 0);
      const hasData = values.some(value => value !== 0);

      if (!hasData) {
        notify(config.emptyMessage);
        return;
      }

      const total = values.reduce((sum, value) => sum + value, 0);
      const average = total / config.divisor;

      sumOutput.textContent = formatCurrency(total);
      valueOutput.textContent = formatCurrency(average);
      result.style.display = 'block';

      notify(config.successMessage);
    });

    inputs.forEach(input => {
      input.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
          button.click();
        }
      });
    });
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-PY', {
      style: 'currency',
      currency: 'PYG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  function notify(message) {
    if (typeof showToast === 'function') {
      showToast(message);
    }
  }
});
