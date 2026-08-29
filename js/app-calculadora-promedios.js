'use strict';

function forceGsInputsAsText() {
  const gsAverageInputs = ['calc-monto-a', 'calc-monto-b', 'calc-monto-c']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  gsAverageInputs.forEach(input => {
    input.setAttribute('type', 'text');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.inputMode = 'numeric';
    input.setAttribute('autocomplete', 'off');
  });

  return gsAverageInputs;
}

function extraerSalariosRobusto(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return [];

  try {
    const regex = /Gs\s*\.?\s*:\s*([0-9]+(?:\.[0-9]+)*)/gi;
    const cleaned = [];
    const vistos = new Set();
    let match;

    while ((match = regex.exec(texto)) !== null) {
      const bloqueNumero = String(match[1] || '').trim();
      if (!bloqueNumero) continue;

      const numeroLimpio = bloqueNumero.replace(/[^0-9]/g, '');
      if (!numeroLimpio) continue;

      const numero = Number(numeroLimpio);
      if (!Number.isSafeInteger(numero) || numero < 0) continue;

      const clave = String(numero);
      if (!vistos.has(clave)) {
        vistos.add(clave);
        cleaned.push(numero);
      }
    }

    return cleaned;
  } catch (error) {
    console.error('Error al procesar el texto de salarios:', error);
    return [];
  }
}

forceGsInputsAsText();

document.addEventListener('DOMContentLoaded', function() {
  const gsAverageInputs = forceGsInputsAsText();

  function completarPromedioDesdeTexto(input) {
    if (!input) return false;

    const valor = String(input.value || '');
    const salarios = extraerSalariosRobusto(valor);

    if (salarios.length !== 3) {
      if (/Gs\s*\.?\s*:/i.test(valor)) {
        gsAverageInputs.forEach(field => { field.value = ''; });
      }
      return false;
    }

    gsAverageInputs.forEach((field, index) => {
      field.value = String(salarios[index]);
    });

    return true;
  }

  function clearGsInputs() {
    gsAverageInputs.forEach(input => {
      input.value = '';
    });
  }

  function calculateGsAverage() {
    const button = document.getElementById('calc-promedio-btn');
    if (button && typeof button.click === 'function') {
      button.click();
    }
  }

  gsAverageInputs.forEach(input => {
    input.addEventListener('paste', function() {
      setTimeout(() => {
        const ok = completarPromedioDesdeTexto(input);
        if (ok) calculateGsAverage();
      }, 0);
    });

    input.addEventListener('blur', function() {
      const value = String(input.value || '');
      if (!value) {
        clearGsInputs();
        return;
      }
      const ok = completarPromedioDesdeTexto(input);
      if (ok) calculateGsAverage();
    });

    input.addEventListener('change', function() {
      const value = String(input.value || '');
      if (!value) {
        clearGsInputs();
        return;
      }
      const ok = completarPromedioDesdeTexto(input);
      if (ok) calculateGsAverage();
    });

    input.addEventListener('input', function() {
      const value = String(input.value || '');
      if (/Gs\s*\.?\s*:/i.test(value)) {
        const ok = completarPromedioDesdeTexto(input);
        if (ok) calculateGsAverage();
      }
    });
  });

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
