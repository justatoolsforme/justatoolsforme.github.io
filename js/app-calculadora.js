// ============ CALCULADORA - APP - FINANZAS ============

document.addEventListener('DOMContentLoaded', function() {
  
  // ========== BOTÓN LIMPIAR TODO ==========
  const btnCleanAll = document.getElementById('calc-clean-all');
  btnCleanAll.addEventListener('click', function() {
    // Limpiar todos los inputs de la calculadora
    const calcSection = document.getElementById('view-calculadora');
    const allInputs = calcSection.querySelectorAll('input[type="number"]');
    allInputs.forEach(input => {
      if (input.id === 'calc-iva-porcentaje') {
        input.value = '10';
      } else if (input.id === 'calc-cap-porcentaje') {
        input.value = '30';
      } else if (input.id === 'calc-cuota-interes') {
        input.value = '';
      } else {
        input.value = '';
      }
    });
    // Ocultar todos los resultados
    const allResults = calcSection.querySelectorAll('.calc-result');
    allResults.forEach(result => result.style.display = 'none');
    showToast('Todos los campos han sido limpiados', 'success');
  });
  
  // ========== CALCULADORA 2: IVA ==========
  const btnIva = document.getElementById('calc-iva-btn');
  const inputIvaPorcentaje = document.getElementById('calc-iva-porcentaje');
  const inputIvaMonto = document.getElementById('calc-iva-monto');
  const resultIva = document.getElementById('calc-iva-result');
  const baseIva = document.getElementById('calc-iva-base');
  const valorIva = document.getElementById('calc-iva-valor');
  const gananciaIva = document.getElementById('calc-iva-ganancia');
  const totalIva = document.getElementById('calc-iva-total');
  const pctDisplay = document.getElementById('calc-iva-pct');

  // Actualizar el porcentaje mostrado en tiempo real
  inputIvaPorcentaje.addEventListener('change', function() {
    pctDisplay.textContent = inputIvaPorcentaje.value || '10';
  });

  btnIva.addEventListener('click', function() {
    const monto = parseFloat(inputIvaMonto.value) || 0;
    const porcentaje = parseFloat(inputIvaPorcentaje.value) || 10;

    if (monto <= 0) {
      showToast('Por favor ingresa un monto válido', 'warning');
      return;
    }

    const iva = monto * (porcentaje / 100);
    const ganancia = monto - iva;
    const total = monto + iva;

    baseIva.textContent = formatCurrency(monto);
    valorIva.textContent = formatCurrency(iva);
    gananciaIva.textContent = formatCurrency(ganancia);
    totalIva.textContent = formatCurrency(total);
    pctDisplay.textContent = porcentaje;
    resultIva.style.display = 'block';

    showToast('IVA calculado correctamente', 'success');
  });

  // Permitir Enter para calcular
  [inputIvaPorcentaje, inputIvaMonto].forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        btnIva.click();
      }
    });
  });

  // ========== CALCULADORA 3: CUOTA MENSUAL ==========
  const btnCuota = document.getElementById('calc-cuota-btn');
  const inputCuotaMonto = document.getElementById('calc-cuota-monto');
  const inputCuotaPlazo = document.getElementById('calc-cuota-plazo');
  const inputCuotaInteres = document.getElementById('calc-cuota-interes');
  const resultCuota = document.getElementById('calc-cuota-result');
  const cuotaValor = document.getElementById('calc-cuota-valor');
  const cuotaTotal = document.getElementById('calc-cuota-total');
  const cuotaInteresTotal = document.getElementById('calc-cuota-interes-total');

  btnCuota.addEventListener('click', function() {
    const monto = parseFloat(inputCuotaMonto.value) || 0;
    const plazo = parseInt(inputCuotaPlazo.value) || 0;
    const interes = parseFloat(inputCuotaInteres.value) || 0;

    if (monto <= 0 || plazo <= 0) {
      showToast('Por favor ingresa montos válidos', 'warning');
      return;
    }

    // Fórmula: Cuota = Monto * [i(1+i)^n] / [(1+i)^n - 1]
    const tasaMensual = interes / 100;
    let cuota;
    
    if (tasaMensual === 0) {
      cuota = monto / plazo;
    } else {
      const numerador = tasaMensual * Math.pow(1 + tasaMensual, plazo);
      const denominador = Math.pow(1 + tasaMensual, plazo) - 1;
      cuota = monto * (numerador / denominador);
    }

    const totalPagar = cuota * plazo;
    const interesesTotales = totalPagar - monto;

    cuotaValor.textContent = formatCurrency(cuota);
    cuotaTotal.textContent = formatCurrency(totalPagar);
    cuotaInteresTotal.textContent = formatCurrency(Math.max(0, interesesTotales));
    resultCuota.style.display = 'block';

    showToast('Cuota mensual calculada', 'success');
  });

  [inputCuotaMonto, inputCuotaPlazo, inputCuotaInteres].forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        btnCuota.click();
      }
    });
  });

  // ========== CALCULADORA 4: CAPACIDAD DE PAGO ==========
  const btnCapacidad = document.getElementById('calc-cap-btn');
  const inputCapSalario = document.getElementById('calc-cap-salario');
  const inputCapPorcentaje = document.getElementById('calc-cap-porcentaje');
  const resultCapacidad = document.getElementById('calc-cap-result');
  const capSalarioShow = document.getElementById('calc-cap-salario-show');
  const capMaximo = document.getElementById('calc-cap-maximo');
  const capPctShow = document.getElementById('calc-cap-pct-show');

  btnCapacidad.addEventListener('click', function() {
    const salario = parseFloat(inputCapSalario.value) || 0;
    const porcentaje = parseFloat(inputCapPorcentaje.value) || 30;

    if (salario <= 0) {
      showToast('Por favor ingresa un salario válido', 'warning');
      return;
    }

    const maxioPago = salario * (porcentaje / 100);

    capSalarioShow.textContent = formatCurrency(salario);
    capMaximo.textContent = formatCurrency(maxioPago);
    capPctShow.textContent = porcentaje + '%';
    resultCapacidad.style.display = 'block';

    showToast('Capacidad de pago calculada', 'success');
  });

  [inputCapSalario, inputCapPorcentaje].forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        btnCapacidad.click();
      }
    });
  });

  // ========== CALCULADORA 5: DEUDA MÁXIMA ==========
  const btnDeuda = document.getElementById('calc-deuda-btn');
  const inputDeudaSalario = document.getElementById('calc-deuda-salario');
  const inputDeudaCuota = document.getElementById('calc-deuda-cuota');
  const inputDeudaPlazo = document.getElementById('calc-deuda-plazo');
  const resultDeuda = document.getElementById('calc-deuda-result');
  const deudaMaximo = document.getElementById('calc-deuda-maximo');
  const deudaCuotaShow = document.getElementById('calc-deuda-cuota-show');
  const deudaCapacidad = document.getElementById('calc-deuda-capacidad');

  btnDeuda.addEventListener('click', function() {
    const salario = parseFloat(inputDeudaSalario.value) || 0;
    const cuota = parseFloat(inputDeudaCuota.value) || 0;
    const plazo = parseInt(inputDeudaPlazo.value) || 0;

    if (salario <= 0 || cuota <= 0 || plazo <= 0) {
      showToast('Por favor ingresa valores válidos', 'warning');
      return;
    }

    // Crédito máximo = Cuota * Plazo
    const creditoMaximo = cuota * plazo;
    // Capacidad = (Cuota / Salario) * 100
    const capacidad = (cuota / salario) * 100;

    deudaMaximo.textContent = formatCurrency(creditoMaximo);
    deudaCuotaShow.textContent = formatCurrency(cuota);
    deudaCapacidad.textContent = capacidad.toFixed(2) + '%';
    resultDeuda.style.display = 'block';

    showToast('Deuda máxima calculada', 'success');
  });

  [inputDeudaSalario, inputDeudaCuota, inputDeudaPlazo].forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        btnDeuda.click();
      }
    });
  });

  // ========== CALCULADORA 6: ANÁLISIS DE CLIENTE ==========
  const btnCliente = document.getElementById('calc-cliente-btn');
  const inputClienteSalario = document.getElementById('calc-cliente-salario');
  const inputClienteCredito = document.getElementById('calc-cliente-credito');
  const inputClientePlazo = document.getElementById('calc-cliente-plazo');
  const resultCliente = document.getElementById('calc-cliente-result');
  const clienteCuota = document.getElementById('calc-cliente-cuota');
  const clientePorcentaje = document.getElementById('calc-cliente-porcentaje');
  const clienteEstado = document.getElementById('calc-cliente-estado');
  const clienteEstadoText = document.getElementById('calc-cliente-estado-text');
  const clienteObservation = document.getElementById('calc-cliente-observation');

  btnCliente.addEventListener('click', function() {
    const salario = parseFloat(inputClienteSalario.value) || 0;
    const credito = parseFloat(inputClienteCredito.value) || 0;
    const plazo = parseInt(inputClientePlazo.value) || 0;

    if (salario <= 0 || credito <= 0 || plazo <= 0) {
      showToast('Por favor ingresa todos los datos', 'warning');
      return;
    }

    // Cuota estimada sin interés (para simplicidad)
    const cuota = credito / plazo;
    const porcentajeSalario = (cuota / salario) * 100;

    // Determinación de estado
    let estado, color, observation = '';
    
    if (porcentajeSalario <= 20) {
      estado = '✓ APROBADO';
      color = '#34d399';
      observation = 'Excelente perfil. Cliente con buena capacidad de pago.';
    } else if (porcentajeSalario <= 30) {
      estado = '✓ APROBADO';
      color = '#10b981';
      observation = 'Capacidad de pago dentro de rangos normales.';
    } else if (porcentajeSalario <= 40) {
      estado = '⚠ REVISAR';
      color = '#f59e0b';
      observation = 'Capacidad de pago límite. Requiere revisión adicional.';
    } else {
      estado = '✗ RECHAZADO';
      color = '#f87171';
      observation = 'Capacidad de pago insuficiente. No recomendado.';
    }

    clienteCuota.textContent = formatCurrency(cuota);
    clientePorcentaje.textContent = porcentajeSalario.toFixed(2) + '%';
    clienteEstadoText.textContent = estado;
    clienteEstado.style.backgroundColor = `${color}15`;
    clienteEstadoText.style.color = color;
    clienteObservation.textContent = observation;
    resultCliente.style.display = 'block';

    showToast('Análisis de cliente completado', 'success');
  });

  [inputClienteSalario, inputClienteCredito, inputClientePlazo].forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        btnCliente.click();
      }
    });
  });

  // ========== UTILIDADES ==========
  
  /**
   * Formatea un número a formato de moneda (Gs.)
   */
  function formatCurrency(value) {
    return new Intl.NumberFormat('es-PY', {
      style: 'currency',
      currency: 'PYG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  /**
   * Muestra un toast/notificación
   */
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast show toast--' + type;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

});
