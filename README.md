# Posiciones de Oro · XAUUSD

Herramienta web autocontenida para llevar la posición de contratos de **XAUUSD** (oro): posición neta, precio promedio, P&L realizado y flotante, y calculadora de tamaño de posición. Sin instalación, sin cuentas, sin backend: abrilo y usalo.

**→ Abrir `index.html` en cualquier navegador. Eso es todo.**

## Qué calcula

| Cálculo | Cómo |
|---|---|
| **Posición neta** | Oz compradas − oz vendidas → *largo*, *corto* o *plano* |
| **Precio promedio** | Σ(lotes × precio) ÷ lotes totales de cada lado (promedio ponderado por volumen) |
| **P&L realizado** | Pareo FIFO de cada compra contra su venta: `(precio venta − precio compra) × onzas` |
| **P&L flotante** | El mismo cálculo contra el precio actual del oro, sobre la posición abierta |
| **Tamaño de posición** | `lotes = (capital × % riesgo) ÷ (distancia stop × 100)` |

### La convención de XAUUSD

- **1 lote estándar = 100 onzas troy.**
- **Cada $1.00 de movimiento = $100 por lote estándar.**
- El `100` en la fórmula de tamaño es exactamente eso: las onzas por lote. El resto es aritmética.

Ejemplo: capital $10.000, riesgo 1% ($100), stop a $5.00 → `100 ÷ (5 × 100) = 0.20 lotes`.

## Características

- Las operaciones se **guardan en tu navegador** (`localStorage`) — nada sale de tu máquina.
- El tamaño de posición se redondea **hacia abajo** al paso de lote real (0.01): nunca arriesgás más de lo definido.
- Sección plegable *"¿Cómo se calcula?"* dentro de la página, para entender cada fórmula sin salir de la herramienta.

## Verificación

La lógica de cálculo (`calc.js`) está separada de la interfaz y cubierta por 21 tests en Node, sin dependencias:

```bash
node calc.test.js
```

Los tests cubren conversión de lotes, posición neta, promedio ponderado, P&L FIFO (largos, cortos, cierres parciales, cruce de lados), P&L flotante y validación de entradas del sizing.

## Estructura

```
index.html      Interfaz (autocontenida, carga calc.js)
calc.js         Lógica de cálculo pura (Node y navegador)
calc.test.js    Tests de la lógica (node calc.test.js)
```

## Notas

- El P&L realizado usa **FIFO**; confirmá cómo liquida tu broker (FIFO vs. promedio) si los números difieren.
- Herramienta educativa de gestión de posiciones; no es asesoramiento financiero.
