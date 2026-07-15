/**
 * @fileOverview Ayuda por elemento de notación: explicación + ejemplo.
 *
 * Se muestra en el modal "?" de cada item de la paleta del diseñador.
 * Claves = `type` de NotationElement (ver notations.ts). Cubre DDD/BPMN/C4/UML.
 * Tipos compartidos (Actor, Sistema Externo, Componente) usan una sola entrada.
 */

export interface ElementHelp {
  description: string;
  example: string;
}

export const NOTATION_HELP: Record<string, ElementHelp> = {
  "Comando": {
    description: "Es una intención o solicitud de que algo ocurra en el sistema, expresada en modo imperativo. Representa la acción que un actor desea ejecutar y normalmente desencadena la lógica de negocio que, si se cumplen las reglas, produce uno o más eventos de dominio.",
    example: "En e-commerce, el comando 'RealizarPedido' lo emite el cliente al confirmar el carrito de compra.",
  },
  "Evento": {
    description: "Es un hecho relevante para el negocio que ya ocurrió, expresado en pasado. Es inmutable y representa un cambio de estado significativo que otros componentes pueden observar y reaccionar ante él; es el bloque central del Event Storming.",
    example: "En banca, el evento 'TransferenciaRealizada' indica que el dinero ya salió de la cuenta origen hacia la cuenta destino.",
  },
  "Actor": {
    description: "Representa un rol que un usuario, sistema externo u otra entidad desempeña al interactuar con el sistema. Se dibuja como una figura de palitos (stick figure) en los diagramas de casos de uso. Se usa para identificar quién inicia o participa en la funcionalidad del sistema, siempre desde una perspectiva externa.",
    example: "En salud, el actor Paciente que interactúa con un sistema de citas, o el actor Sistema de Aseguradora que valida coberturas de forma externa.",
  },
  "Vista": {
    description: "Es una representación de solo lectura de los datos optimizada para mostrar información a un actor, típicamente derivada de los eventos. Sirve para que los usuarios tomen decisiones y suele construirse del lado de lectura en arquitecturas CQRS.",
    example: "En logística, la vista 'EstadoDeEnvío' muestra en tiempo real la ubicación y fase actual de un paquete al cliente.",
  },
  "Regla de Negocio": {
    description: "Es una restricción o invariante que el dominio debe cumplir siempre para mantener la consistencia y validez de los datos. Determina qué comandos son válidos y bajo qué condiciones se permiten o rechazan las operaciones.",
    example: "En banca, la regla 'El saldo de la cuenta no puede ser negativo' impide ejecutar un retiro mayor al saldo disponible.",
  },
  "Sistema Externo": {
    description: "Representa otro sistema de software, fuera del alcance del equipo, con el que el sistema principal se integra o del que depende. Se muestra para entender el ecosistema y las dependencias externas, pero no se detalla su arquitectura interna.",
    example: "En banca, una 'Pasarela de Pagos' de un tercero o el 'Sistema Central del Banco' (core bancario) que procesa las transacciones.",
  },
  "Política": {
    description: "Es una regla reactiva del tipo 'cuando ocurre un evento, entonces se dispara un comando'. Captura la lógica del negocio que conecta un evento con una acción de seguimiento automática, modelando procesos y decisiones.",
    example: "En e-commerce, la política 'Cuando un pedido es pagado, entonces iniciar la preparación del envío' coordina los departamentos de cobro y bodega.",
  },
  "Raíz de Agregado": {
    description: "Es la entidad principal de un agregado que actúa como único punto de entrada para acceder y modificar sus componentes internos. Garantiza la consistencia de todas las invariantes del agregado y es la única referencia que objetos externos pueden mantener.",
    example: "En e-commerce, el 'Pedido' es la raíz de agregado que controla sus líneas de producto y asegura que el total siempre coincida con la suma de sus ítems.",
  },
  "Entidad": {
    description: "Es un objeto del dominio que tiene identidad propia y continuidad a lo largo del tiempo, independiente de sus atributos. Dos entidades con los mismos valores siguen siendo distintas si tienen identificadores diferentes.",
    example: "En salud, un 'Paciente' es una entidad identificada por su número de historia clínica, aunque cambie su dirección o teléfono.",
  },
  "Objeto de Valor": {
    description: "Es un objeto que se define únicamente por sus atributos y no tiene identidad propia, por lo que es inmutable e intercambiable. Se compara por su valor y se usa para describir características o medidas del dominio.",
    example: "En banca, un 'Dinero' compuesto por monto y moneda (100 USD) es un objeto de valor: dos importes con los mismos valores son equivalentes.",
  },
  "Servicio de Dominio": {
    description: "Es una operación de negocio que no pertenece naturalmente a ninguna entidad u objeto de valor concreto, normalmente porque coordina varios objetos del dominio. Encapsula lógica significativa que no encaja en un solo agregado.",
    example: "En banca, un servicio de dominio 'TransferenciaDeFondos' coordina el débito de una cuenta y el crédito de otra aplicando las reglas correspondientes.",
  },
  "Repositorio": {
    description: "Es una abstracción que provee acceso a las raíces de agregado como si fueran una colección en memoria, ocultando los detalles de persistencia. Permite recuperar y almacenar agregados sin acoplar el dominio a la tecnología de base de datos.",
    example: "En e-commerce, el 'RepositorioDePedidos' permite buscar un pedido por su identificador o guardar uno nuevo sin que el dominio conozca la base de datos usada.",
  },
  "Fábrica": {
    description: "Es un componente responsable de encapsular la lógica compleja de creación de agregados, entidades u objetos de valor, garantizando que nazcan en un estado válido. Separa la construcción del objeto de su comportamiento de negocio.",
    example: "En logística, una 'FábricaDeEnvíos' crea un envío completo con su ruta, paquetes y costos calculados a partir de un pedido confirmado.",
  },
  "Agregado": {
    description: "Es un grupo de entidades y objetos de valor que se tratan como una sola unidad de consistencia transaccional, delimitada por una raíz de agregado. Define un límite dentro del cual se deben cumplir todas las invariantes al guardar los cambios.",
    example: "En e-commerce, el agregado 'Pedido' agrupa el pedido, sus líneas de detalle y la dirección de entrega como una unidad coherente.",
  },
  "Contexto Delimitado": {
    description: "Es una frontera explícita dentro de la cual un modelo de dominio y su lenguaje ubicuo tienen un significado preciso y consistente. Separa partes del sistema para evitar ambigüedades y permitir que cada equipo evolucione su modelo de forma independiente.",
    example: "En e-commerce, el contexto 'Catálogo' entiende 'Producto' como ficha de venta, mientras que el contexto 'Inventario' lo entiende como existencia física en bodega.",
  },
  "Subdominio": {
    description: "Es una división del dominio total del negocio según su área de problema, clasificándose en núcleo (core), de soporte o genérico. Ayuda a priorizar dónde invertir esfuerzo de modelado según el valor estratégico que aporta.",
    example: "En banca, la 'Evaluación de Riesgo Crediticio' es un subdominio núcleo que diferencia al negocio, mientras que la 'Facturación' es de soporte.",
  },
  "Cliente/Proveedor": {
    description: "Es una relación del mapa de contexto en la que un contexto upstream (proveedor) suministra a un contexto downstream (cliente), y ambos equipos negocian prioridades. El downstream puede influir en el upstream para que cubra sus necesidades.",
    example: "En e-commerce, el contexto 'Pedidos' (cliente) negocia con el contexto 'Inventario' (proveedor) qué datos de disponibilidad necesita para planear sus iteraciones.",
  },
  "Conformista": {
    description: "Es una relación del mapa de contexto en la que el contexto downstream adopta sin cambios el modelo del upstream, sin capacidad de negociación. Se acepta el modelo ajeno tal cual para reducir el esfuerzo de traducción cuando no hay influencia sobre el proveedor.",
    example: "En logística, un sistema interno actúa como conformista al adoptar exactamente el modelo de datos que impone la API de una empresa transportadora dominante como DHL.",
  },
  "Partnership": {
    description: "Es una relación del mapa de contexto en la que dos equipos tienen objetivos mutuamente dependientes y coordinan su planificación y desarrollo de forma conjunta. Ambos contextos triunfan o fracasan juntos, por lo que colaboran estrechamente en la integración.",
    example: "En salud, los contextos 'Agendamiento de Citas' y 'Historia Clínica' forman un partnership porque una nueva funcionalidad de teleconsulta requiere que ambos evolucionen en sincronía.",
  },
  "Servicio de Host Abierto (OHS)": {
    description: "Es un patrón en el que un contexto upstream expone un protocolo o API pública y estable para que múltiples consumidores se integren con él. Define un conjunto de servicios bien documentados que evitan tener que negociar integraciones a medida con cada cliente.",
    example: "En banca, el contexto 'Cuentas' publica una API REST de Host Abierto para que cualquier sistema interno consulte saldos y movimientos de forma estandarizada.",
  },
  "Lenguaje Publicado (PL)": {
    description: "Es un lenguaje o formato de intercambio bien documentado y compartido que sirve como medio común de comunicación entre contextos. Suele acompañar a un Servicio de Host Abierto para que las partes interpreten los datos de forma uniforme.",
    example: "En salud, el estándar 'HL7 FHIR' es un lenguaje publicado que permite a hospitales y laboratorios intercambiar información clínica con un formato común.",
  },
  "Capa Anticorrupción (ACL)": {
    description: "Es una capa de traducción que aísla al modelo de un contexto downstream del modelo de un sistema externo o upstream, convirtiendo entre ambos. Protege la integridad del dominio propio evitando que conceptos ajenos contaminen su lenguaje ubicuo.",
    example: "En e-commerce, una capa anticorrupción traduce los datos de un ERP legado al modelo limpio del contexto 'Facturación' para que este no herede las rarezas del sistema antiguo.",
  },
  "Núcleo Compartido": {
    description: "Es un subconjunto del modelo de dominio y código que dos o más equipos comparten y mantienen en colaboración. Reduce la duplicación, pero exige fuerte coordinación porque cualquier cambio afecta a todos los contextos que dependen de él.",
    example: "En banca, los contextos 'Préstamos' y 'Tarjetas' comparten un núcleo común con las entidades 'Cliente' y 'Documento de Identidad' que ambos equipos gestionan juntos.",
  },
  "Caminos Separados": {
    description: "Es una decisión del mapa de contexto en la que dos contextos no se integran porque el costo de hacerlo supera el beneficio. Cada contexto resuelve sus necesidades de forma independiente, sin compartir modelo ni comunicación directa.",
    example: "En logística, los contextos de 'Recursos Humanos' y 'Seguimiento de Flota' siguen caminos separados al no tener necesidades comunes que justifiquen integrarlos.",
  },
  "Evento de Inicio": {
    description: "Representa el punto donde arranca un proceso de negocio. Indica qué disparador da origen al flujo (la llegada de un mensaje, una fecha programada o una acción del usuario). Se dibuja como un círculo de borde delgado y solo tiene flujos de salida.",
    example: "En un e-commerce, el proceso de gestión de pedidos inicia con el evento 'Cliente confirma la compra en el carrito'.",
  },
  "Evento Intermedio": {
    description: "Ocurre entre el inicio y el fin de un proceso, indicando algo que sucede o que el flujo debe esperar mientras está en marcha. Se usa para representar esperas, recepción/envío de mensajes o temporizadores intermedios. Se dibuja como un círculo de doble borde.",
    example: "En banca, durante una solicitud de crédito el proceso espera el evento intermedio 'Recepción del reporte de la central de riesgo' antes de continuar la evaluación.",
  },
  "Evento de Fin": {
    description: "Marca la terminación de un camino del proceso e indica el resultado alcanzado. Solo tiene flujos de entrada y se dibuja como un círculo de borde grueso. Un proceso puede tener varios eventos de fin según los distintos desenlaces posibles.",
    example: "En logística, el proceso de entrega termina con el evento de fin 'Paquete entregado y firmado por el destinatario'.",
  },
  "Tarea": {
    description: "Es una unidad de trabajo atómica que realiza una persona o un sistema dentro del proceso y que no se descompone en más detalle. Es el elemento de actividad más básico y se representa como un rectángulo de esquinas redondeadas. Puede ser manual, de usuario, de servicio o de envío, entre otros tipos.",
    example: "En salud, la tarea 'Registrar signos vitales del paciente' es ejecutada por la enfermera durante el proceso de admisión.",
  },
  "Subproceso": {
    description: "Es una actividad compuesta que agrupa y encapsula un conjunto de tareas y otros elementos en un flujo interno propio. Permite manejar la complejidad mostrando un nivel resumido que puede expandirse para ver el detalle. Se dibuja como un rectángulo redondeado con un signo '+' cuando está colapsado.",
    example: "En banca, el proceso de apertura de cuenta incluye el subproceso 'Verificación de identidad', que internamente agrupa validar documento, consultar listas y confirmar datos.",
  },
  "Compuerta": {
    description: "Controla la divergencia y convergencia del flujo, decidiendo qué caminos se siguen según condiciones o cómo se sincronizan. Existen compuertas exclusivas, paralelas e inclusivas, entre otras. Se representa como un rombo, a veces con un símbolo interno que indica su tipo.",
    example: "En e-commerce, una compuerta exclusiva evalúa '¿El pago fue aprobado?' y dirige el flujo a 'Preparar envío' o a 'Notificar pago rechazado'.",
  },
  "Objeto de Datos": {
    description: "Representa la información, documentos o datos que una actividad necesita como entrada o produce como salida. No controla el flujo, sino que documenta qué datos circulan por el proceso. Se dibuja como una hoja de papel con la esquina superior doblada.",
    example: "En logística, el objeto de datos 'Guía de despacho' es generado por la tarea de preparación del envío y consumido por la tarea de entrega.",
  },
  "Pool": {
    description: "Es un contenedor que representa a un participante del proceso, como una organización, empresa o entidad completa. Delimita el alcance de un proceso y separa la responsabilidad de cada participante; la comunicación entre pools se hace mediante mensajes. Se dibuja como un rectángulo grande etiquetado en su borde.",
    example: "En seguros, un diagrama tiene un pool 'Aseguradora' y otro pool 'Cliente', que intercambian mensajes durante la solicitud de una póliza.",
  },
  "Carril": {
    description: "Es una subdivisión dentro de un pool que organiza las actividades según el rol, área o responsable que las ejecuta. Permite ver quién hace qué dentro de un mismo participante. Se dibuja como franjas (horizontales o verticales) dentro del pool.",
    example: "En salud, dentro del pool 'Hospital' los carriles 'Recepción', 'Enfermería' y 'Médico' separan las tareas según quién las realiza en la atención del paciente.",
  },
  "Persona": {
    description: "Representa a un actor humano (usuario, rol o grupo de personas) que interactúa con el sistema. Se usa en el diagrama de Contexto del Sistema para mostrar quién utiliza el software y con qué propósito.",
    example: "En e-commerce, un 'Cliente' que navega el catálogo y realiza compras, o un 'Administrador de inventario' que gestiona el stock.",
  },
  "Sistema": {
    description: "Es el sistema de software principal cuya arquitectura se está describiendo (el sistema en el alcance). Aparece como el elemento central del diagrama de Contexto, mostrando su propósito de alto nivel sin detallar su interior.",
    example: "En banca, el 'Sistema de Banca en Línea' que permite a los clientes consultar saldos y transferir fondos.",
  },
  "Contenedor": {
    description: "Es una aplicación o almacén de datos ejecutable o desplegable de forma independiente (aplicación web, API, app móvil, base de datos). Se usa en el diagrama de Contenedores para mostrar la estructura técnica de alto nivel del sistema y cómo se distribuyen las responsabilidades.",
    example: "En salud, una 'Aplicación Web de Citas' (SPA en React) y una 'API REST de Historias Clínicas' (servicio en Node.js) que se comunican entre sí.",
  },
  "Componente": {
    description: "Representa una parte modular y reemplazable de un sistema que encapsula su implementación y expone su funcionalidad a través de interfaces. Se dibuja como un rectángulo con el icono de componente o el estereotipo «component». Se usa en diagramas de componentes para mostrar la arquitectura del software y cómo se conectan sus módulos.",
    example: "En e-commerce, un componente PasarelaDePagos que expone una interfaz para procesar transacciones y se conecta con el componente GestionDePedidos.",
  },
  "Base de Datos": {
    description: "Es un tipo especializado de contenedor cuya función es almacenar datos de forma persistente. Se representa de manera distinta (cilindro) para destacar dónde reside la información del sistema.",
    example: "En logística, una base de datos 'PostgreSQL de Envíos' que almacena pedidos, rutas y estados de entrega de los paquetes.",
  },
  "Límite de Sistema": {
    description: "Es una frontera visual (recuadro punteado) que agrupa los contenedores pertenecientes a un mismo sistema, separándolo de personas y sistemas externos. Se usa en el diagrama de Contenedores para delimitar claramente qué está dentro del alcance del sistema.",
    example: "En e-commerce, un límite que encierra la app web, la API de pedidos y la base de datos del 'Sistema de Tienda Online', dejando fuera la pasarela de pagos.",
  },
  "Límite de Contenedor": {
    description: "Es una frontera visual que agrupa los componentes que viven dentro de un mismo contenedor. Se usa en el diagrama de Componentes para indicar claramente qué piezas de código forman parte de un contenedor concreto.",
    example: "En banca, un límite que rodea los componentes 'Controlador de Transferencias', 'Validador de Fondos' y 'Repositorio de Cuentas' dentro de la API de Transferencias.",
  },
  "Clase": {
    description: "Es el bloque fundamental de los diagramas de clases UML. Representa un conjunto de objetos que comparten los mismos atributos, operaciones y relaciones. Se dibuja como un rectángulo dividido en tres compartimentos: nombre, atributos y métodos. Se usa para modelar las entidades concretas del dominio que pueden instanciarse.",
    example: "En un sistema de e-commerce, la clase Producto con atributos como nombre, precio y stock, y métodos como aplicarDescuento() o actualizarStock().",
  },
  "Clase Abstracta": {
    description: "Es una clase que no puede instanciarse directamente y que sirve como plantilla base para otras clases. Su nombre se escribe en cursiva y puede contener métodos abstractos (sin implementación) que las subclases deben implementar. Se usa para capturar comportamiento y atributos comunes que serán compartidos por varias subclases.",
    example: "En banca, una clase abstracta CuentaBancaria define el método abstracto calcularInteres(), que implementan de forma distinta sus subclases CuentaAhorros y CuentaCorriente.",
  },
  "Interfaz": {
    description: "Define un contrato de operaciones que una clase debe implementar, sin proporcionar ninguna implementación. Se representa con el estereotipo «interface» o con un círculo (notación lollipop) y permite desacoplar el qué del cómo. Se usa para garantizar que clases distintas ofrezcan un mismo conjunto de comportamientos.",
    example: "En logística, la interfaz MedioDeTransporte declara las operaciones calcularTiempoEntrega() y calcularCosto(), implementadas por las clases Camion, Avion y Barco.",
  },
  "Enumeración": {
    description: "Es un tipo de dato especial que define un conjunto cerrado y finito de valores constantes con nombre. Se representa con el estereotipo «enumeration» y lista sus literales en un compartimento. Se usa para modelar atributos que solo pueden tomar un valor de una lista predefinida.",
    example: "En salud, la enumeración EstadoCita con los literales PROGRAMADA, CONFIRMADA, CANCELADA y ATENDIDA, usada por el atributo estado de una cita médica.",
  },
  "Nodo": {
    description: "Representa un recurso físico o computacional en tiempo de ejecución donde se despliegan y ejecutan los componentes del sistema, como un servidor o un dispositivo. Se dibuja como un cubo tridimensional en los diagramas de despliegue. Se usa para modelar la infraestructura física sobre la que corre el software.",
    example: "En banca, un nodo ServidorDeAplicaciones que aloja el componente del core bancario y se comunica con un nodo ServidorDeBaseDeDatos.",
  },
  "Caso de Uso": {
    description: "Describe una funcionalidad o servicio completo que el sistema ofrece a sus actores para alcanzar un objetivo concreto. Se dibuja como una elipse con el nombre de la acción en los diagramas de casos de uso. Se usa para capturar los requisitos funcionales desde el punto de vista del usuario.",
    example: "En logística, el caso de uso Rastrear Envío, mediante el cual el actor Cliente consulta la ubicación actual de su paquete.",
  },
  "Paquete": {
    description: "Es un mecanismo de agrupación que organiza elementos del modelo (clases, componentes, otros paquetes) en espacios de nombres lógicos. Se dibuja como una carpeta con una pestaña en la parte superior. Se usa para estructurar modelos grandes, reducir su complejidad y definir dependencias entre módulos.",
    example: "En e-commerce, un paquete Catalogo que agrupa las clases Producto, Categoria y Inventario, separándolas del paquete Pedidos.",
  },
  "Nota": {
    description: "Es un comentario o aclaración que se ancla a cualquier elemento del diagrama sin afectar su semántica. Se usa para registrar decisiones, supuestos o pendientes que el modelo por sí solo no expresa.",
    example: "Una nota «La validación de cupo se define con el área de riesgo» junto al caso de uso Aprobar Crédito.",
  },
  // --- BPMN: eventos especializados ---
  "Evento de Mensaje": {
    description: "Es un evento que representa el envío o la recepción de un mensaje entre participantes (pools) del proceso. Como evento de inicio arranca el flujo al llegar un mensaje; como intermedio espera o emite uno; como evento de fin notifica un mensaje al terminar. Se dibuja como un círculo con un sobre en su interior.",
    example: "En seguros, el proceso de la aseguradora inicia con el evento de mensaje 'Solicitud de póliza recibida' enviado desde el pool del Cliente.",
  },
  "Evento Temporizador": {
    description: "Es un evento que se dispara por una condición de tiempo: una fecha/hora concreta, un retardo o un ciclo recurrente. Sirve para modelar esperas, plazos y vencimientos dentro del proceso. Se dibuja como un círculo con un reloj en su interior.",
    example: "En banca, durante la firma de un crédito un evento temporizador 'Han pasado 15 días sin firma' cancela automáticamente la solicitud.",
  },
  "Evento de Error": {
    description: "Es un evento que captura o lanza un error dentro del proceso, interrumpiendo el flujo normal para tratar la excepción. Adosado al borde de una actividad desvía el flujo cuando esa actividad falla. Se dibuja como un círculo con un rayo/triángulo de error en su interior.",
    example: "En e-commerce, si la tarea 'Cobrar tarjeta' falla, un evento de error 'Pago rechazado' desvía el flujo hacia la cancelación del pedido.",
  },
  "Almacén de Datos": {
    description: "Representa un repositorio persistente de información que sobrevive más allá de una sola instancia del proceso, del que las actividades leen o en el que escriben. A diferencia del Objeto de Datos (transitorio), el Almacén de Datos modela una base de datos o archivo permanente. Se dibuja como un cilindro.",
    example: "En logística, las tareas del proceso de despacho consultan y actualizan el almacén de datos 'Base de Inventario' para reservar existencias.",
  },
  "Anotación": {
    description: "Es un artefacto puramente documental que agrega una nota o comentario explicativo a un elemento del diagrama, sin afectar el flujo. Se conecta con una línea punteada al elemento que aclara. Se dibuja como un corchete abierto con texto.",
    example: "En salud, una anotación junto a la compuerta de triaje aclara 'Prioridad según escala de Manchester' para quien lee el proceso.",
  },
  // --- BPMN: compuertas (decisiones) ---
  "Compuerta Exclusiva": {
    description: "Es una compuerta de decisión (XOR) que dirige el flujo por UNO solo de sus caminos según se cumpla una condición. Cada rama de salida lleva una condición y solo se toma la primera que se cumple (más una ruta por defecto). Se dibuja como un rombo con una 'X' en su interior.",
    example: "En e-commerce, una compuerta exclusiva evalúa '¿El pago fue aprobado?' y envía el flujo a 'Preparar envío' o a 'Notificar rechazo', nunca a ambos.",
  },
  "Compuerta Paralela": {
    description: "Es una compuerta (AND) que divide el flujo en varios caminos que se ejecutan TODOS en simultáneo, sin condiciones. Al converger, espera a que todas las ramas entrantes terminen antes de continuar (sincronización). Se dibuja como un rombo con un signo '+' en su interior.",
    example: "En banca, al aprobar una cuenta una compuerta paralela dispara a la vez 'Emitir tarjeta' y 'Activar banca en línea', y el proceso sigue cuando ambas acaban.",
  },
  "Compuerta Inclusiva": {
    description: "Es una compuerta (OR) que activa UNO O MÁS de sus caminos según cuáles condiciones se cumplan, pudiendo tomar varias ramas a la vez. Al converger, sincroniza solo las ramas que realmente se activaron. Se dibuja como un rombo con un círculo en su interior.",
    example: "En seguros, al evaluar un siniestro una compuerta inclusiva activa 'Peritaje de daños' y/o 'Revisión médica' según el tipo de cobertura afectada.",
  },
  "Compuerta de Eventos": {
    description: "Es una compuerta cuyo camino lo decide cuál EVENTO ocurre primero, en lugar de una condición de datos. El flujo espera en la compuerta y avanza por la rama del evento que se dispare antes (mensaje, temporizador, etc.). Se dibuja como un rombo con un pentágono/círculo de evento en su interior.",
    example: "En e-commerce, tras enviar una confirmación el proceso espera en una compuerta de eventos: avanza por 'Cliente responde' o, si llega antes, por el temporizador 'Pasaron 48 horas'.",
  },
  // --- UML: máquina de estados ---
  "Estado Inicial": {
    description: "Es el pseudoestado que marca el punto de arranque de la máquina de estados: indica en qué estado comienza el objeto al crearse. Solo tiene una transición de salida y no recibe transiciones. Se dibuja como un círculo negro relleno.",
    example: "En e-commerce, el estado inicial de un Pedido apunta con su transición al estado 'Pendiente de pago' apenas se crea el pedido.",
  },
  "Estado": {
    description: "Representa una situación o condición del ciclo de vida de un objeto durante la cual cumple alguna actividad o espera un evento. Las transiciones entre estados se etiquetan con 'evento [guarda] / acción'. Se dibuja como un rectángulo de esquinas redondeadas con el nombre del estado.",
    example: "En logística, un Envío transita por los estados 'En bodega', 'En tránsito' y 'Entregado' a medida que avanza su recorrido.",
  },
  "Estado Compuesto": {
    description: "Es un estado que contiene a su vez una submáquina de estados (subestados anidados), permitiendo modelar comportamiento jerárquico. Agrupa estados internos que comparten transiciones de salida comunes. Se dibuja como un estado grande que encierra otros estados.",
    example: "En banca, el estado compuesto 'Activa' de una cuenta agrupa los subestados 'Al día' y 'En mora', que comparten la transición a 'Cerrada'.",
  },
  "Decisión": {
    description: "Es un pseudoestado de decisión (choice) que bifurca una transición en varias ramas mutuamente excluyentes según condiciones de guarda evaluadas en ese punto. Elige dinámicamente el siguiente estado. Se dibuja como un rombo.",
    example: "En un cajero, tras 'Validar PIN' una decisión evalúa '¿PIN correcto?' y dirige a 'Menú principal' o de vuelta a 'Esperando PIN'.",
  },
  "Historial": {
    description: "Es un pseudoestado de historia que recuerda cuál fue el último subestado activo de un estado compuesto, para reanudarlo al volver a entrar en lugar de empezar desde el inicial. Se dibuja como un círculo con una 'H' en su interior.",
    example: "En un reproductor, al salir y volver del estado 'Reproduciendo', el historial restaura si estaba en 'Pausa' o 'Avance rápido'.",
  },
  "Estado Final": {
    description: "Marca la terminación de la máquina de estados: el objeto alcanzó el fin de su ciclo de vida y no acepta más transiciones. Puede haber varios según los desenlaces. Se dibuja como un círculo con un anillo (ojo de buey).",
    example: "En e-commerce, el estado final de un Pedido se alcanza tras 'Entregado' o 'Cancelado', cerrando su ciclo de vida.",
  },
  // --- UML: diagrama de actividad ---
  "Inicio de Actividad": {
    description: "Es el nodo inicial que marca dónde comienza el flujo de un diagrama de actividad. Tiene una sola salida y arranca la secuencia de acciones. Se dibuja como un círculo negro relleno.",
    example: "En salud, el inicio de actividad del proceso de admisión apunta a la acción 'Solicitar documento de identidad'.",
  },
  "Acción": {
    description: "Es un paso ejecutable y atómico dentro de un flujo de actividad: una unidad de trabajo que transforma entradas en salidas. Las flechas de control conectan acciones en orden. Se dibuja como un rectángulo de esquinas redondeadas.",
    example: "En e-commerce, la acción 'Calcular total con impuestos' toma el carrito y produce el monto final a cobrar.",
  },
  "Nodo de Decisión": {
    description: "Es un nodo de control que bifurca el flujo de actividad en ramas alternativas según condiciones de guarda; solo se toma una rama. Su contraparte, el nodo de unión (merge), vuelve a juntar las ramas. Se dibuja como un rombo.",
    example: "En banca, un nodo de decisión evalúa '¿Monto > límite?' y deriva a 'Requiere aprobación' o 'Aprobar automáticamente'.",
  },
  "Bifurcación/Unión": {
    description: "Es un nodo de control para concurrencia: la bifurcación (fork) divide el flujo en varias ramas que corren en paralelo, y la unión (join) las sincroniza esperando a que todas terminen. Se dibuja como una barra gruesa perpendicular al flujo.",
    example: "En logística, una bifurcación lanza en paralelo 'Imprimir guía' y 'Notificar al cliente'; la unión espera ambas antes de 'Despachar'.",
  },
  "Fin de Actividad": {
    description: "Es el nodo final que termina el flujo de la actividad: al alcanzarlo, finaliza toda la actividad (o solo el flujo, según el tipo). Se dibuja como un círculo con un anillo (ojo de buey).",
    example: "En salud, el flujo de admisión llega al fin de actividad tras la acción 'Asignar habitación', concluyendo el proceso.",
  },
};
