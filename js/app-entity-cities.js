/* ============================================================
   Ciudades por entidad (JSON). Editar aquí para cambiar las reglas.

   - JAPONESA.restringidas: si la ciudad PERSONAL o LABORAL coincide, Japonesa
     queda bloqueada (botón en rojo; el hover explica el motivo).
   - MARKET.habilitadas_interior: fuera de Asunción y Central, Market sólo se
     habilita (en verde) si la ciudad PERSONAL está en esta lista; si no, rojo.

   Cada ciudad es un texto o {"nombre", "alias"}: los alias cubren cómo aparece
   en el buscador de ciudades (GEO_DATA) y abreviaturas habituales. La
   comparación ignora mayúsculas, tildes, puntuación y abreviaturas (Gral., Cnel.,
   Dr., Pdte., Tte., Mcal., Sto., Col., Cap.).
   ============================================================ */
window.TUFI_ENTITY_CITIES = {
  "JAPONESA": {
    "restringidas": {
      "Región Oriental": {
        "San Pedro": [
          "San Estanislao",
          { "nombre": "San Pedro del Ycuamandyyú", "alias": ["San Pedro", "San Pedro de Ycuamandyyú", "San Pedro del Ycuamandiyu"] },
          { "nombre": "Guayaibí", "alias": ["Guayaibi"] },
          { "nombre": "Choré", "alias": ["Chore"] },
          "Capiibary",
          "Yrybucuá",
          "Santa Rosa del Aguaray",
          { "nombre": "General Elizardo Aquino", "alias": ["Gral. E. Aquino", "Elizardo Aquino"] },
          "Liberación",
          "25 de Diciembre",
          { "nombre": "General Francisco Isidoro Resquín", "alias": ["Gral. Isidoro Resquín", "Isidoro Resquín", "Gral. Resquín"] },
          "Lima",
          { "nombre": "San Pablo", "alias": ["San Pablo Kokuere"] },
          "Villa del Rosario",
          { "nombre": "Ybyrarobaná", "alias": ["Yvyrarovana", "Ybyrarovana"] },
          { "nombre": "Unión", "alias": ["Distrito Union"] },
          "Nueva Germania",
          "Antequera"
        ],
        "Canindeyú": [
          { "nombre": "Canindeyú", "alias": ["Canindeyu"] },
          "Curuguaty",
          { "nombre": "Yasy Cañy", "alias": ["Yasy Cany"] },
          "Nueva Esperanza",
          "Salto del Guairá",
          "Corpus Christi",
          { "nombre": "Villa Ygatimí", "alias": ["Igatimi", "Ygatimi", "Villa Ygatymi", "Ygatymi"] },
          { "nombre": "Yby Pytá", "alias": ["Ybypyta", "Yvy Pyta"] },
          "Katueté",
          "Itanará",
          "Ypejhú",
          "La Paloma",
          { "nombre": "General Francisco Caballero Álvarez", "alias": ["Gral. Francisco C. A.", "Gral. Francisco Caballero Alvarez", "Francisco Caballero Alvarez", "Puentesiño"] }
        ],
        "Caaguazú": [
          "Tembiaporá",
          "San José Obrero",
          { "nombre": "Dr. Cecilio Báez", "alias": ["Cecilio Báez"] },
          "Simón Bolívar",
          "Santa Rosa del Mbutuy"
        ],
        "Amambay": [
          "Pedro Juan Caballero",
          "Bella Vista Norte",
          "Capitán Bado",
          { "nombre": "Zanja Pytã", "alias": ["Zanja Pyta"] }
        ],
        "Itapúa": [
          "Edelira",
          "Yatytay"
        ],
        "Ñeembucú": [
          "Laureles",
          "Desmochados",
          { "nombre": "General Díaz", "alias": ["Gral. Díaz"] }
        ],
        "Caazapá": [
          "3 de Mayo"
        ],
        "Misiones": [
          { "nombre": "Santa María de Fe", "alias": ["Santa María"] }
        ],
        "Alto Paraná": [
          "Itakyry"
        ],
        "Guairá": [
          "Itapé"
        ],
        "Cordillera": [
          { "nombre": "Mayor José D. Martínez", "alias": ["Mayor Martínez", "Mayor José Dejesús Martínez"] }
        ]
      },
      "Región Occidental (Chaco)": {
        "Boquerón": [
          "Filadelfia",
          "Loma Plata",
          { "nombre": "Mariscal José Félix Estigarribia", "alias": ["Mcal. José Félix Estigarribia", "Mariscal Estigarribia", "Mcal. Estigarribia"] },
          "Boquerón"
        ],
        "Presidente Hayes": [
          "Puerto Pinasco",
          { "nombre": "Teniente 1° Manuel Irala Fernández", "alias": ["Tte. Irala Fernandez", "Teniente Irala Fernández", "Irala Fernández"] },
          { "nombre": "General José María Bruguez", "alias": ["Gral. José María Bruguez", "Gral. Bruguez"] }
        ],
        "Alto Paraguay": [
          "Fuerte Olimpo",
          "Puerto Casado"
        ]
      }
    }
  },
  "MARKET": {
    "departamentos_habilitados": ["Asunción", "Central"],
    "habilitadas_interior": {
      "Ciudad del Este": [
        "Ciudad del Este",
        { "nombre": "Presidente Franco", "alias": ["Pdte. Franco"] },
        "Hernandarias",
        "Minga Guazú",
        "Cedrales",
        { "nombre": "Colonia Iguazú", "alias": ["Col. Iguazú", "Yguazú", "Colonia Yguazú"] },
        "Santa Rita",
        "Tavapy",
        { "nombre": "Santa Rosa del Monday", "alias": ["Santa Rosa de Monday"] },
        { "nombre": "Doctor Juan León Mallorquín", "alias": ["Dr. J.L. Mallorquín", "Juan León Mallorquín", "J. L. Mallorquín"] },
        { "nombre": "Juan E. O'Leary", "alias": ["Juan Emiliano O'Leary"] },
        { "nombre": "Primero de Mayo km 21", "alias": ["Primero de Mayo km.21", "1 de Mayo", "Primero de Mayo"] },
        "Cruce Dolores",
        { "nombre": "Colonia General Pablo Colman", "alias": ["Col. Gral. P. Colman", "Gral. P. Colman"] },
        "Santa Lourdes",
        "Caacupemi",
        "Santa Lucía",
        "San Alfredo",
        "San Cristóbal"
      ],
      "Encarnación": [
        "Encarnación",
        { "nombre": "General Delgado", "alias": ["Gral. Delgado"] },
        { "nombre": "Coronel Bogado", "alias": ["Cnel. Bogado"] },
        "Carmen del Paraná",
        "Arroyo Poso Chaipe",
        "Capitán Miranda",
        "Bella Vista",
        { "nombre": "Fram", "alias": ["Fran"] },
        { "nombre": "Hohenau", "alias": ["Hoenau"] },
        { "nombre": "Pirapó", "alias": ["Pirapo"] },
        "Jesús",
        "San Juan del Paraná",
        { "nombre": "Cambyretá", "alias": ["Cambyreta"] },
        "Trinidad",
        "Capitán Meza",
        "San Pedro del Paraná",
        { "nombre": "General Artigas", "alias": ["Gral. Artigas"] }
      ],
      "Coronel Oviedo": [
        "Coronel Oviedo",
        { "nombre": "Carayaó", "alias": ["Carayao"] },
        "Simón Bolívar",
        "La Pastora",
        "Nueva Londres",
        "Blas Garay",
        "Caaguazú",
        "Aguapety",
        "San José de los Arroyos",
        { "nombre": "Dr. Cecilio Báez", "alias": ["Cecilio Báez"] },
        { "nombre": "R.I. 3 Corrales", "alias": ["R. I. Tres Corrales", "RI 3 Corrales", "Tres Corrales"] },
        "San Antonio",
        "Capillita",
        "Alemán Cué",
        "Parque Guayaki",
        { "nombre": "Troche", "alias": ["Mauricio José Troche"] },
        "Natalicio Talavera",
        "Arroyo Guazú",
        "Empalado",
        "Santa Catalina",
        "Montanaro",
        { "nombre": "Compañía Santo Domingo", "alias": ["Com. Sto. Domingo", "Santo Domingo"] },
        { "nombre": "Nicolás Bo", "alias": ["Nicolás Bo."] }
      ],
      "Villarrica": [
        "Villarrica",
        "Mbocayaty",
        "Yataity",
        { "nombre": "Félix Pérez Cardozo", "alias": ["Félix Pérez"] },
        { "nombre": "Coronel Martínez", "alias": ["Cnel. Martínez"] },
        "Tebicuary",
        "Natalicio Talavera",
        "Mauricio José Troche",
        { "nombre": "Dr. Bottrell", "alias": ["Dr. Botrell", "Doctor Bottrell"] },
        "Colonia Independencia",
        { "nombre": "Paso Yobái", "alias": ["Paso Yobai"] },
        "San Salvador",
        "Iturbe",
        { "nombre": "Eugenio A. Garay", "alias": ["Gral. Eugenio A. Garay", "General Eugenio A. Garay"] },
        { "nombre": "José Fassardi", "alias": ["José Fasardi"] },
        "Ñumí",
        "Caazapá",
        "Tape",
        { "nombre": "Tebicuarymí", "alias": ["Tebicuary – Mi", "Tebicuary-mí", "Tebicuary Mi"] },
        { "nombre": "Fulgencio Yegros", "alias": ["Yegros"] },
        "Borja",
        "San Juan Nepomuceno",
        { "nombre": "Abaí", "alias": ["Avai", "Abai"] },
        "Buena Vista"
      ]
    }
  }
};
