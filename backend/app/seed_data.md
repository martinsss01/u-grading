# Datos de seed — u-grading

Borrador editable. El script de seed lee **solo las tablas** de este archivo;
el texto libre es documentación. Reglas de formato:

- Una sección se referencia como `CODIGO/AÑO/SEMESTRE/NÚMERO`,
  p. ej. `CC3001/2026/Primavera/1`. `SEMESTRE` ∈ `Otoño`, `Primavera`, `Verano`.
- Listas dentro de una celda: separadas por coma.
- Las contraseñas **no** van aquí (ver `SEED_PASSWORD` en el plan de seed).

---

## 1. Cursos y secciones

Número de secciones a crear por semestre. `0` = no se dicta ese semestre.
Todos los cursos deben existir siempre; edita solo los números.

| Código | Nombre | 2026 Otoño | 2026 Primavera | 2027 Otoño | 2027 Primavera |
|---|---|---|---|---|---|
| MA1001 | Introducción al Cálculo | 2 | 1 | 2 | 1 |
| MA1101 | Introducción al Álgebra | 2 | 1 | 2 | 1 |
| FI1000 | Introducción a la Física Clásica | 2 | 1 | 2 | 1 |
| CC1000 | Herramientas Computacionales para Ingeniería y Ciencias | 2 | 1 | 2 | 1 |
| CD1100 | Desafíos de Innovación en Ingeniería y Ciencias | 2 | 1 | 2 | 1 |
| BT1211 | Aplicaciones de la Biología a la Ingeniería y Ciencias | 1 | 1 | 1 | 1 |
| MA1002 | Cálculo Diferencial e Integral | 1 | 2 | 1 | 2 |
| MA1102 | Álgebra Lineal | 1 | 2 | 1 | 2 |
| FI1100 | Introducción a la Física Moderna | 1 | 2 | 1 | 2 |
| CC1002 | Introducción a la Programación | 1 | 2 | 1 | 2 |
| CD1201 | Proyecto de Innovación en Ingeniería y Ciencias | 1 | 1 | 1 | 1 |
| MA2001 | Cálculo en Varias Variables | 1 | 1 | 1 | 1 |
| MA2601 | Ecuaciones Diferenciales Ordinarias | 1 | 1 | 1 | 1 |
| FI2003 | Métodos Experimentales | 1 | 1 | 1 | 1 |
| FI2001 | Mecánica | 1 | 1 | 1 | 1 |
| IQ2211 | Química | 1 | 1 | 1 | 1 |
| IN2201 | Economía | 1 | 1 | 1 | 1 |
| MA2002 | Cálculo Avanzado y Aplicaciones | 1 | 1 | 1 | 1 |
| FI2002 | Electromagnetismo | 1 | 1 | 1 | 1 |
| FI2004 | Termodinámica | 1 | 1 | 1 | 1 |
| CD2201 | Módulo Interdisciplinario | 1 | 1 | 1 | 1 |
| CC3001 | Algoritmos y Estructuras de Datos | 1 | 2 | 1 | 2 |
| CC3101 | Matemáticas Discretas para la Computación | 1 | 1 | 1 | 1 |
| CC3501 | Modelación y Computación Gráfica para Ingenieros | 1 | 1 | 1 | 1 |
| MA3403 | Probabilidades y Estadística | 1 | 1 | 1 | 1 |
| CC3002 | Metodologías de Diseño y Programación | 1 | 1 | 1 | 1 |
| CC3102 | Teoría de la Computación | 1 | 1 | 1 | 1 |
| CC3201 | Bases de Datos | 1 | 1 | 1 | 1 |
| CC3301 | Programación de Software de Sistemas | 1 | 1 | 1 | 1 |
| CC4102 | Diseño y Análisis de Algoritmos | 1 | 1 | 1 | 1 |
| CC4302 | Sistemas Operativos | 1 | 1 | 1 | 1 |
| CC4401 | Ingeniería de Software | 1 | 1 | 1 | 1 |
| CC5205 | Minería de Datos | 1 | 1 | 1 | 1 |
| CC4901 | Práctica Profesional I | 1 | 1 | 1 | 1 |
| CC4101 | Lenguajes de Programación | 1 | 1 | 1 | 1 |
| CC4303 | Redes | 1 | 1 | 1 | 1 |
| CC4402 | Formulación, Evaluación y Gestión de Proyectos | 1 | 1 | 1 | 1 |
| CC5601 | Núcleo Gestión para Ingenieros I | 1 | 1 | 1 | 1 |
| CC5602 | Núcleo Gestión para Ingenieros II | 1 | 1 | 1 | 1 |
| CC5901 | Práctica Profesional II | 1 | 1 | 1 | 1 |
| CC5402 | Proyecto de Software | 1 | 1 | 1 | 1 |
| CC6907 | Introducción al Trabajo de Título | 1 | 1 | 1 | 1 |
| CC6919 | Trabajo de Título | 1 | 1 | 1 | 1 |

---

## 2. Usuarios

Los usuarios no tienen un rol propio: Profesor, Ayudante y Estudiante son
roles *por sección* (`SectionMember.role`, ver §4). `Administrador` (`Sí`/`No`)
es un permiso de la plataforma (`User.is_admin`) para administrar usuarios,
cursos y secciones.

| Nombre | Email | Administrador |
|---|---|---|
| Admin | admin@ugrading.cl | Sí |
| Profesor1 | profesor1@ugrading.cl | No |
| Profesor2 | profesor2@ugrading.cl | No |
| Profesor3 | profesor3@ugrading.cl | No |
| Ayudante1 | ayudante1@ugrading.cl | No |
| Ayudante2 | ayudante2@ugrading.cl | No |
| Ayudante3 | ayudante3@ugrading.cl | No |
| Ayudante4 | ayudante4@ugrading.cl | No |
| Estudiante1 | estudiante1@ugrading.cl | No |
| Estudiante2 | estudiante2@ugrading.cl | No |
| Estudiante3 | estudiante3@ugrading.cl | No |
| Estudiante4 | estudiante4@ugrading.cl | No |
| Estudiante5 | estudiante5@ugrading.cl | No |
| Estudiante6 | estudiante6@ugrading.cl | No |
| Estudiante7 | estudiante7@ugrading.cl | No |
| Estudiante8 | estudiante8@ugrading.cl | No |
| Estudiante9 | estudiante9@ugrading.cl | No |
| Estudiante10 | estudiante10@ugrading.cl | No |

---

## 3. Grupos

Atajo para no repetir emails en las membresías. Se usa como `@nombre-grupo`.

| Grupo | Usuarios |
|---|---|
| estudiantes | estudiante1@ugrading.cl, estudiante2@ugrading.cl, estudiante3@ugrading.cl, estudiante4@ugrading.cl, estudiante5@ugrading.cl, estudiante6@ugrading.cl, estudiante7@ugrading.cl, estudiante8@ugrading.cl, estudiante9@ugrading.cl, estudiante10@ugrading.cl |

---

## 4. Membresías

Cada fila crea un `SectionMember` por cada (usuario × sección).
`Rol en sección` ∈ `Profesor`, `Ayudante`, `Estudiante`.

### 4.1 Ramos comunes de los estudiantes

Todos los estudiantes toman los mismos ramos: un semestre pasado (2026 Otoño)
para tener historial y el semestre actual (2026 Primavera).

| Usuarios | Rol en sección | Secciones |
|---|---|---|
| @estudiantes | Estudiante | CC3002/2026/Otoño/1, CC3102/2026/Otoño/1, CC3301/2026/Otoño/1, MA2601/2026/Otoño/1 |
| @estudiantes | Estudiante | CC3001/2026/Primavera/1, CC3101/2026/Primavera/1, CC3201/2026/Primavera/1, CC3501/2026/Primavera/1, MA3403/2026/Primavera/1 |

### 4.2 Profesores de esos ramos

| Usuarios | Rol en sección | Secciones |
|---|---|---|
| profesor1@ugrading.cl | Profesor | CC3001/2026/Primavera/1, CC3101/2026/Primavera/1, CC3002/2026/Otoño/1 |
| profesor2@ugrading.cl | Profesor | CC3201/2026/Primavera/1, CC3501/2026/Primavera/1, CC3102/2026/Otoño/1 |
| profesor3@ugrading.cl | Profesor | MA3403/2026/Primavera/1, CC3301/2026/Otoño/1, MA2601/2026/Otoño/1 |

### 4.3 Ayudantes de esos ramos

| Usuarios | Rol en sección | Secciones |
|---|---|---|
| ayudante1@ugrading.cl | Ayudante | CC3001/2026/Primavera/1, CC3101/2026/Primavera/1, CC3002/2026/Otoño/1 |
| ayudante2@ugrading.cl | Ayudante | CC3201/2026/Primavera/1, CC3001/2026/Primavera/1, CC3102/2026/Otoño/1 |
| ayudante3@ugrading.cl | Ayudante | CC3501/2026/Primavera/1, MA3403/2026/Primavera/1, CC3301/2026/Otoño/1 |
| ayudante4@ugrading.cl | Ayudante | MA3403/2026/Primavera/1, CC3201/2026/Primavera/1, MA2601/2026/Otoño/1 |

### 4.4 Ramos propios de los ayudantes (como estudiantes)

Ramos de cursos superiores, para que tengan vista de cursos. Nunca deben
coincidir con una sección donde son ayudantes.

| Usuarios | Rol en sección | Secciones |
|---|---|---|
| ayudante1@ugrading.cl | Estudiante | CC4102/2026/Primavera/1, CC4302/2026/Primavera/1, CC4401/2026/Primavera/1 |
| ayudante2@ugrading.cl | Estudiante | CC4101/2026/Primavera/1, CC4303/2026/Primavera/1, CC5205/2026/Primavera/1 |
| ayudante3@ugrading.cl | Estudiante | CC4102/2026/Primavera/1, CC5402/2026/Primavera/1, IN2201/2026/Primavera/1 |
| ayudante4@ugrading.cl | Estudiante | CC4401/2026/Primavera/1, CC4402/2026/Primavera/1, CC6907/2026/Primavera/1 |
