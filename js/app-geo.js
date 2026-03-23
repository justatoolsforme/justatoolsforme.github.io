/* ============================================================
   TUFI TOOLS — app-geo.js
   Responsabilidad: Datos geográficos de Paraguay y helpers
   ============================================================ */
'use strict';

const GEO_DATA = {
  "ASUNCIÓN": ["Asunción"],
  "CONCEPCION": ["Aquidabán Cañada","Arroyito","Arroyo de Oro","Azotey","Belén","Bernardino Caballero","Calle 15","Cerro Memby","Cerro Morado","Concepción","Cuero Fresco","Horqueta","Hugua Ñandu (J. S. Miranda)","Isla Peña Hermosa","Loreto","Mbocaya I","Pagani","Paso Barreto","Paso Horqueta","Paso Hu","Paso Tuya","Puerto Itapucumi","Puerto Fonciere","Puerto Itacua","San Alfredo","San Carlos del Apa","San Lazaro","Santo Domingo","Sapucai","Sgto. José Félix López","Tres Cerros","Vallemi","Yby Yaú","Zanja Moroti"],
  "SAN PEDRO": ["25 de Diciembre","Antequera","Capiibary","Chore","Distrito Union","Gral. E. Aquino","Gral. Isidoro Resquín","Guayaibi","Itacurubí del Rosario","Liberación","Lima","Nueva Germania","San Estanislao","San Jose del Rosario","San Pablo Kokuere","San Pedro de Ycuamandyyú","San Vicente Pancholo","Santa Rosa del Aguaray","Tacuati","Unión","Villa del Rosario","Yataity del Norte","Yrybucuá"],
  "CORDILLERA": ["1º de Marzo","Altos","Arroyos y Esteros","Atyrá","Caacupé","Caraguatay","Emboscada","Eusebio Ayala","Gral. Delgado","Isla Pucú","Itacurubí de la Cordillera","Juan de Mena","Loma Grande","Mbocayaty","Mbocayaty del Yhaguy","Nueva Colombia","Piribebuy","San Bernardino","San José Obrero","Santa Helena","Tobatí","Valenzuela","Ypacaraí"],
  "GUAIRA": ["Boquerón","Borja","Colonia Independencia","Coronel Martínez","Dr. Botrell","Félix Pérez Cardozo","Gral. Eugenio A. Garay","Itapé","Iturbe","José Fassardi","Mauricio José Troche","Mbocayaty","Natalicio Talavera","Paso Yobái","Rojas Potrero","San Salvador","Tebicuary","Villarrica","Yataity","Ñumi"],
  "CAAGUAZU": ["3 de Febrero","Caaguazú","Carayaó","Coronel Oviedo","Dr. Cecilio Báez","Dr. Juan Eulogio Estigarribia","Dr. Juan Manuel Frutos","José Domingo Ocampos","La Pastora","Nueva Londres","Nueva Toledo","R. I. Tres Corrales","Raúl Arsenio Oviedo","Repatriación","San Joaquín","San José de los Arroyos","Santa Rosa del Mbutuy","Santa Teresa - Mcal. López","Santo Domingo","Simón Bolívar","Tembiaporá","Vaquería","Yhú"],
  "CAAZAPA": ["3 de Mayo","Abaí","Buena Vista","Caazapá","Dr. Moisés S. Bertoni","Fulgencio Yegros","Gral. Higinio Morínigo","Maciel","San Juan Nepomuceno","Tavaí","Yuty"],
  "ITAPUA": ["Alto Verá","Bella Vista","Cambyretá","Capitán Meza","Capitán Miranda","Carlos Antonio López","Carmen del Paraná","Coronel Bogado","Edelira","Encarnación","Federico Chávez","Fram","Gral. Artigas","Gral. Delgado","Hohenau","Itapúa Poty","Jesús","José Leandro Oviedo","La Paz","María Auxiliadora","Mayor Otaño","Naranjito","Natalio","Nueva Alborada","Obligado","Pirapey","Pirapó","San Cosme y Damián","San Juan del Paraná","San Pedro del Paraná","San Rafael del Paraná","Tirol","Trinidad","Triunfo","Yatytay"],
  "MISIONES": ["Ayolas","San Ignacio","San Juan Bautista","San Miguel","San Patricio","Santa María","Santa Rosa","Santiago","Villa Florida","Yabebyry"],
  "PARAGUARI": ["Acahay","Caapucú","Carapeguá","Cerrito","Comandante Peralta","Costa Alegre","Costa Gaona","Costa Irala","Escobar","Gral. Bernardino Caballero","La Colmena","Loma Pyta","Matachi","Mbuyapey","Paraguarí","Pirayú","Quiindy","Quyquyhó","San Roque González de Santa Cruz","Sapucai","Tebicuarymí","Tirol","Yaguarón","Ybycuí","Ybytymí"],
  "ALTO PARANA": ["Ciudad del Este","Hernandarias","Itakyry","Juan E. O'Leary","Juan León Mallorquín","Minga Guazú","Minga Porá","Naranjal","Presidente Franco","Raúl Peña","San Alberto","San Cristóbal","Santa Fe","Santa Rita","Santa Rosa del Monday","Yguazú"],
  "CENTRAL": ["Areguá","Capiatá","Fernando de la Mora","Guarambaré","Itá","Itauguá","J. Augusto Saldívar","Lambaré","Limpio","Luque","Mariano Roque Alonso","Nueva Italia","San Antonio","San Lorenzo","Villa Elisa","Villeta","Ypacaraí","Ypané","Ñemby"],
  "ÑEEMBUCU": ["Alberdi","Cerrito","Desmochados","Gral. Díaz","Guazú Cuá","Humaitá","Isla Umbú","Laureles","Mayor Martínez","Paso de Patria","Pilar","San Juan Bautista del Ñeembucu","Tacuaras","Villa Franca","Villa Oliva","Villalbín"],
  "AMAMBAY": ["Bella Vista Norte","Capitán Bado","Pedro Juan Caballero","Zanja Pyta"],
  "CANINDEYU": ["Alborada","Corpus Christi","Curuguaty","Gasory","Guadalupe","Katueté","La Paloma","Marangatu","Nueva Esperanza","Salto del Guairá","Villa Ygatymi","Yjhovy","Ypejhú","Yvyrarovana"],
  "PRESIDENTE HAYES": ["Benjamín Aceval","Gral. José María Bruguez","Nanawa","Pozo Colorado","Remansito","Tte. Irala Fernandez","Villa Hayes"],
  "ALTO PARAGUAY": ["Bahia Negra","Carmelo Peralta","Fuerte Olimpo","Puerto Casado","Puerto Guaraní","Puerto Pinasco","Toro Pampa"],
  "BOQUERÓN": ["Campo Loa","Gral. Díaz","La Patria","Laguna Negra","Mcal. José Félix Estigarribia","Pirizal","Pozo Hondo","Santa Teresita","Teniente Picco"]
};

/* ── Helpers ─────────────────────────────────────────────── */

/**
 * Devuelve lista plana de {city, dept}
 * @returns {Array<{city: string, dept: string}>}
 */
function geoGetAllCities() {
  const result = [];
  for (const [dept, cities] of Object.entries(GEO_DATA)) {
    cities.forEach(city => result.push({ city, dept }));
  }
  return result;
}

/** Normaliza texto para búsqueda (sin tildes, lowercase) */
function geoNormalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Busca ciudades que coincidan con el término
 * @param {string} term
 * @param {number} limit
 * @returns {Array<{city: string, dept: string}>}
 */
function geoSearch(term, limit = 20) {
  if (!term || term.length < 1) return [];
  const q = geoNormalize(term);
  return geoGetAllCities()
    .filter(({ city }) => geoNormalize(city).includes(q))
    .sort((a, b) => {
      // Priorizar las que empiezan con el término
      const aStarts = geoNormalize(a.city).startsWith(q);
      const bStarts = geoNormalize(b.city).startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.city.localeCompare(b.city);
    })
    .slice(0, limit);
}