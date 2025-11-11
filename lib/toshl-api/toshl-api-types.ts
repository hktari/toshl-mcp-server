export interface ToshlAPITypes {
    title:       string;
    description: string;
    version:     string;
    generated:   Date;
    schemas:     Schemas;
}

export interface Schemas {
    main:     Main;
    account:  Account;
    entry:    Entry;
    budget:   Budget;
    category: Category;
    tag:      Tag;
    currency: SchemasCurrency;
    export:   Export;
}

export interface Account {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    extends:     Extends;
    title:       string;
    description: string[];
    properties:  TentacledProperties;
    links:       AccountLink[];
}

export interface Extends {
    $ref: string;
}

export interface AccountLink {
    rel:          string;
    href:         string;
    title?:       string;
    description?: string[] | string;
    scope?:       Scope;
    schema?:      PurpleSchema;
    method?:      string;
}

export interface PurpleSchema {
    type:       TypeEnum;
    required:   string[];
    properties: PurpleProperties;
}

export interface PurpleProperties {
    page?:            Deleted;
    per_page?:        Deleted;
    since?:           Avg;
    status?:          Status;
    include_deleted?: RolloverOverride;
    ids?:             IDS;
    id?:              Avg;
    parent?:          Avg;
    name?:            Avg;
    type?:            Avg;
    initial_balance?: Balance;
    currency?:        PropertiesCurrency;
    goal?:            Goal;
    extra?:           Avg;
    name_override?:   NameOverride;
    modified?:        Avg;
    position?:        Deleted;
    order?:           IDS;
    accounts?:        Avg;
    account?:         Avg;
    title?:           Avg;
    sync?:            Avg;
}

export interface DeletedAccountsProperties {
    frequency?:  NameOverride;
    interval?:   Deleted;
    start?:      NameOverride;
    end?:        NameOverride;
    byday?:      NameOverride;
    bymonthday?: NameOverride;
    bysetpos?:   NameOverride;
    iteration?:  Deleted;
    id?:         NameOverride;
    parent?:     Avg;
    children?:   Avg;
}

export interface NameOverride {
    type:        TypeEnum;
    title?:      string;
    description: string;
    default?:    boolean | string;
    deprecated?: boolean;
    items?:      AvgItems;
    readonly?:   boolean;
    properties?: DeletedAccountsProperties;
    format?:     Format;
    enum?:       string[];
    pattern?:    Pattern;
    maxLength?:  number;
    javaType?:   string;
    minimum?:    number;
    maximum?:    number;
}

export interface AvgProperties {
    expenses?:                        Balance;
    incomes?:                         Balance;
    byday?:                           Avg;
    bymonthday?:                      Avg;
    bysetpos?:                        Avg;
    id?:                              ID;
    name?:                            Avg;
    status?:                          Avg;
    logo?:                            Avg;
    code?:                            Avg;
    rate?:                            Order;
    main_rate?:                       Avg;
    fixed?:                           Avg;
    amount?:                          Balance;
    start?:                           Avg;
    end?:                             Avg;
    frequency?:                       Avg;
    interval?:                        Order;
    description?:                     NameOverride;
    deleted_accounts?:                NameOverride;
    deleted_tags?:                    NameOverride;
    deleted_categories?:              NameOverride;
    entries?:                         Deleted;
    income_entries?:                  Deleted;
    expense_entries?:                 Deleted;
    tags_used_with_category?:         Deleted;
    income_tags_used_with_category?:  Deleted;
    expense_tags_used_with_category?: Deleted;
    tags?:                            Deleted;
    income_tags?:                     Deleted;
    expense_tags?:                    Deleted;
    budgets?:                         Deleted;
    connection?:                      NameOverride;
    memo?:                            NameOverride;
    payee?:                           NameOverride;
    pending?:                         NameOverride;
}

export interface Avg {
    type:        TypeEnum;
    title?:      string;
    description: string;
    pattern?:    Pattern;
    default?:    boolean | string;
    readonly?:   boolean;
    javaType?:   string;
    format?:     Format;
    maxLength?:  number;
    enum?:       string[];
    properties?: AvgProperties;
    required?:   string[];
    items?:      AvgItems;
    minLength?:  number;
    deprecated?: boolean;
}

export interface Deleted {
    type:              TypeEnum;
    default?:          boolean | number | string;
    minimum?:          number;
    description:       string;
    maximum?:          number;
    title?:            string;
    readonly?:         boolean;
    javaType?:         string;
    pattern?:          Pattern;
    exclusiveMinimum?: boolean;
    format?:           Format;
    properties?:       CreatedProperties;
    maxLength?:        number;
    enum?:             string[];
    minLength?:        number;
}

export enum Format {
    Date = "date",
    DateTime = "date-time",
    Time = "time",
}

export enum Pattern {
    AZ09_210 = "[A-Z0-9_]{2,10}",
}

export interface CreatedProperties {
    code:      Code;
    rate:      Rate;
    main_rate: MainRate;
    fixed:     Fixed;
}

export interface Code {
    type:        TypeEnum;
    title:       CodeTitle;
    description: string;
    pattern:     Pattern;
}

export enum CodeTitle {
    Currency = "Currency",
}

export enum TypeEnum {
    Array = "array",
    Boolean = "boolean",
    Date = "date",
    Integer = "integer",
    Number = "number",
    Object = "object",
    String = "string",
}

export interface Fixed {
    type:        TypeEnum;
    default:     string;
    title:       FixedTitle;
    description: string;
}

export enum FixedTitle {
    FixedExchangeRate = "Fixed exchange rate",
}

export interface MainRate {
    type:        TypeEnum;
    title:       MainRateTitle;
    description: string;
    readonly:    boolean;
}

export enum MainRateTitle {
    ExchangeRateInMainCurrency = "Exchange rate in main currency",
}

export interface Rate {
    type:             TypeEnum;
    title:            RateTitle;
    description:      string;
    minimum:          number;
    exclusiveMinimum: boolean;
}

export enum RateTitle {
    ExchangeRate = "Exchange rate",
}

export interface AvgItems {
    type: TypeEnum;
}

export interface Balance {
    type:              TypeEnum;
    title:             string;
    description:       string;
    minimum:           number;
    exclusiveMinimum?: boolean;
    maximum:           number;
    exclusiveMaximum:  boolean;
    default?:          number | null;
    readonly?:         boolean;
}

export interface ID {
    type:        TypeEnum;
    title:       string;
    description: string;
}

export interface Order {
    type:              TypeEnum;
    title?:            string;
    description:       string;
    minimum:           number;
    exclusiveMinimum?: boolean;
    maximum?:          number;
}

export interface PropertiesCurrency {
    javaType?:   string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required?:   string[];
    properties?: CreatedProperties;
}

export interface Goal {
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  FluffyProperties;
}

export interface FluffyProperties {
    amount: Balance;
    start:  Avg;
    end:    Avg;
}

export interface IDS {
    type:        TypeEnum;
    description: string;
}

export interface RolloverOverride {
    type:        TypeEnum;
    description: string;
    default?:    boolean;
    title?:      string;
    javaType?:   string;
    readonly?:   boolean;
    enum?:       string[];
    properties?: SymbolProperties;
    format?:     Format;
}

export interface SymbolProperties {
    id:        Deleted;
    type:      TypeClass;
    completed: Deleted;
}

export interface TypeClass {
    type:     TypeEnum;
    javaType: string;
    enum:     string[];
}

export interface Status {
    type:        TypeEnum;
    enum:        string[];
    description: string;
}

export interface Scope {
    anyOf: string[];
}

export interface TentacledProperties {
    id:               Avg;
    parent:           Avg;
    name:             Avg;
    name_override:    NameOverride;
    type:             Avg;
    balance:          Balance;
    initial_balance:  Balance;
    limit:            Balance;
    currency:         Avg;
    daily_sum_median: Avg;
    avg:              Avg;
    status:           Avg;
    order:            Order;
    modified:         Avg;
    goal:             Avg;
    connection:       Avg;
    settle:           Avg;
    billing:          Avg;
    count:            Avg;
    review:           Avg;
    deleted:          Avg;
    recalculated:     Avg;
    extra:            Avg;
}

export interface Budget {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    extends:     Extends;
    title:       string;
    description: string[];
    properties:  BudgetProperties;
    links:       BudgetLink[];
}

export interface BudgetLink {
    rel:         string;
    href:        string;
    title?:      string;
    description: string[] | string;
    scope?:      Scope;
    schema?:     FluffySchema;
    method?:     string;
}

export interface FluffySchema {
    type:       TypeEnum;
    required:   string[];
    properties: StickyProperties;
}

export interface StickyProperties {
    id?:                Avg;
    name?:              Avg;
    limit?:             Balance;
    currency?:          Avg;
    rollover?:          Avg;
    rollover_override?: NameOverride;
    rollover_amount?:   Balance;
    recurrence?:        Avg;
    type?:              Avg;
    percent?:           Order;
    delta?:             Avg;
    tags?:              NameOverride;
    "!tags"?:           Avg;
    categories?:        Avg;
    "!categories"?:     Avg;
    accounts?:          Avg;
    "!accounts"?:       Avg;
    extra?:             Avg;
    modified?:          Avg;
    position?:          Deleted;
    order?:             IDS;
    page?:              Deleted;
    per_page?:          Deleted;
    from?:              Avg;
    to?:                Avg;
}

export interface BudgetProperties {
    id:                      Avg;
    parent:                  Avg;
    name:                    Avg;
    limit:                   Balance;
    limit_planned:           Balance;
    amount:                  Balance;
    planned:                 Balance;
    history_amount_median:   Balance;
    currency:                PropertiesCurrency;
    from:                    Avg;
    to:                      NameOverride;
    rollover:                NameOverride;
    rollover_override:       RolloverOverride;
    rollover_amount:         Balance;
    rollover_amount_planned: Balance;
    modified:                Avg;
    recurrence:              NameOverride;
    status:                  NameOverride;
    type:                    NameOverride;
    percent:                 Order;
    delta:                   Avg;
    order:                   Order;
    tags:                    NameOverride;
    "!tags":                 Avg;
    categories:              Avg;
    "!categories":           Avg;
    accounts:                Avg;
    "!accounts":             NameOverride;
    deleted:                 Avg;
    recalculated:            NameOverride;
    extra:                   Avg;
    problem:                 Avg;
}

export interface Category {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    extends:     Extends;
    title:       string;
    description: string;
    properties:  IndecentProperties;
    links:       CategoryLink[];
}

export interface CategoryLink {
    rel:         string;
    href:        string;
    title?:      string;
    description: string;
    scope?:      Scope;
    schema?:     TentacledSchema;
    method?:     string;
}

export interface TentacledSchema {
    type:       TypeEnum;
    required:   string[];
    properties: IndigoProperties;
}

export interface IndigoProperties {
    id?:            RolloverOverride;
    name?:          Avg;
    type?:          Avg;
    extra?:         RolloverOverride;
    name_override?: Avg;
    modified?:      RolloverOverride;
    categories?:    RolloverOverride;
    category?:      RolloverOverride;
}

export interface IndecentProperties {
    id:            Deleted;
    name:          Avg;
    name_override: Avg;
    modified:      Deleted;
    type:          Avg;
    deleted:       Deleted;
    counts:        Avg;
    extra:         Deleted;
}

export interface SchemasCurrency {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    title:       string;
    description: string;
    properties:  AmbitiousProperties;
    links:       CurrencyLink[];
}

export interface CurrencyLink {
    rel:         string;
    href:        string;
    title:       string;
    description: string;
    scope?:      Scope;
    schema?:     StickySchema;
}

export interface StickySchema {
    type:       TypeEnum;
    required:   any[];
    properties: HilariousProperties;
}

export interface HilariousProperties {
    currencies: IDS;
    since:      NameOverride;
    types:      NameOverride;
}

export interface AmbitiousProperties {
    name:      RolloverOverride;
    symbol:    RolloverOverride;
    precision: Order;
    modified:  RolloverOverride;
    type:      RolloverOverride;
}

export interface Entry {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    extends:     Extends;
    title:       string;
    description: string[];
    properties:  EntryProperties;
    links:       EntryLink[];
}

export interface EntryLink {
    rel:         string;
    href:        string;
    title?:      string;
    description: string[] | string;
    scope?:      Scope;
    schema?:     IndigoSchema;
    method?:     string;
}

export interface IndigoSchema {
    type:       TypeEnum;
    required:   string[];
    properties: CunningProperties;
}

export interface CunningProperties {
    id?:          NameOverride;
    amount?:      Balance;
    currency?:    PropertiesCurrency;
    date?:        NameOverride;
    desc?:        NameOverride;
    account?:     NameOverride;
    category?:    NameOverride;
    tags?:        RolloverOverride;
    location?:    Location;
    repeat?:      Repeat;
    transaction?: PurpleTransaction;
    images?:      PurpleImages;
    reminders?:   Reminders;
    split?:       Split;
    completed?:   NameOverride;
    extra?:       NameOverride;
    modified?:    Avg;
}

export interface PurpleImages {
    type:        TypeEnum;
    title:       string;
    description: string;
    maxItems:    number;
    items:       PurpleItems;
}

export interface PurpleItems {
    javaType:        string;
    type:            TypeEnum;
    extends:         Extends;
    additionalItems: boolean;
    required:        string[];
    properties:      MagentaProperties;
}

export interface MagentaProperties {
    id: ID;
}

export interface Location {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  LocationProperties;
}

export interface LocationProperties {
    id:        ID;
    venue_id:  ID;
    latitude:  ID;
    longitude: ID;
}

export interface Reminders {
    type:        TypeEnum;
    title:       string;
    description: string;
    maxItems:    number;
    items:       RemindersItems;
}

export interface RemindersItems {
    javaType:        string;
    type:            TypeEnum;
    additionalItems: boolean;
    required:        string[];
    properties:      FriskyProperties;
}

export interface FriskyProperties {
    period: Status;
    number: Order;
    at:     NameOverride;
}

export interface Repeat {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  RepeatProperties;
}

export interface RepeatProperties {
    id:         NameOverride;
    start:      NameOverride;
    end:        NameOverride;
    frequency:  NameOverride;
    interval:   NameOverride;
    count:      NameOverride;
    byday:      NameOverride;
    bymonthday: NameOverride;
    bysetpos?:  NameOverride;
    iteration:  NameOverride;
}

export interface Split {
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  MischievousProperties;
}

export interface MischievousProperties {
    parent: RolloverOverride;
}

export interface PurpleTransaction {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  BraggadociousProperties;
}

export interface BraggadociousProperties {
    id:       Deleted;
    account:  Deleted;
    currency: PropertiesCurrency;
}

export interface EntryProperties {
    id:          Deleted;
    amount:      Balance;
    currency:    Deleted;
    date:        Deleted;
    desc:        Deleted;
    account:     Deleted;
    category:    Deleted;
    tags:        Avg;
    location:    Location;
    created:     Deleted;
    modified:    NameOverride;
    repeat:      Extends;
    transaction: FluffyTransaction;
    images:      FluffyImages;
    reminders:   Reminders;
    import:      Avg;
    review:      RolloverOverride;
    settle:      NameOverride;
    split:       NameOverride;
    completed:   Deleted;
    deleted:     Deleted;
    extra:       Deleted;
}

export interface FluffyImages {
    type:        TypeEnum;
    title:       string;
    description: string;
    maxItems:    number;
    items:       FluffyItems;
}

export interface FluffyItems {
    javaType:        string;
    type:            TypeEnum;
    extends:         Extends;
    additionalItems: boolean;
    required:        string[];
    properties:      Properties1;
}

export interface Properties1 {
    id:       Avg;
    path:     Avg;
    filename: Avg;
    type:     Avg;
    status:   Avg;
}

export interface FluffyTransaction {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  Properties2;
}

export interface Properties2 {
    id:       Avg;
    amount:   Balance;
    account:  Avg;
    currency: PropertiesCurrency;
}

export interface Export {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    title:       string;
    description: string;
    properties:  ExportProperties;
    links:       ExportLink[];
}

export interface ExportLink {
    rel:         string;
    href:        string;
    title:       string;
    description: string;
    scope:       Scope;
    schema:      IndecentSchema;
    method?:     string;
}

export interface IndecentSchema {
    type:       TypeEnum;
    required:   string[];
    properties: Properties3;
}

export interface Properties3 {
    id?:        Deleted;
    resources?: Extends;
    formats?:   Extends;
    filters?:   Extends;
    from?:      Deleted;
    to?:        Deleted;
    type?:      Deleted;
    seen?:      RolloverOverride;
    modified?:  Deleted;
}

export interface ExportProperties {
    id:        NameOverride;
    resources: Extends;
    formats:   Extends;
    filters:   Extends;
    from:      NameOverride;
    to:        NameOverride;
    created:   Deleted;
    modified:  NameOverride;
    status:    RolloverOverride;
    type:      NameOverride;
    seen:      RolloverOverride;
    data:      Data;
}

export interface Data {
    type:        TypeEnum;
    javaType:    string;
    title:       string;
    description: string;
    readonly:    boolean;
    properties:  DataProperties;
}

export interface DataProperties {
    path:        RolloverOverride;
    valid_until: RolloverOverride;
    filename:    RolloverOverride;
    filesize:    RolloverOverride;
}

export interface Main {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    title:       string;
    description: string;
    properties:  MainProperties;
    links:       CurrencyLink[];
}

export interface MainProperties {
}

export interface Tag {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    extends:     Extends;
    title:       string;
    description: string;
    properties:  Properties5;
    links:       TagLink[];
}

export interface TagLink {
    rel:         string;
    href:        string;
    title?:      string;
    description: string;
    scope?:      Scope;
    schema?:     HilariousSchema;
    method?:     string;
}

export interface HilariousSchema {
    type:       TypeEnum;
    required:   string[];
    properties: Properties4;
}

export interface Properties4 {
    id?:            RolloverOverride;
    name?:          Avg;
    type?:          Avg;
    category?:      RolloverOverride;
    extra?:         RolloverOverride;
    name_override?: Avg;
    modified?:      RolloverOverride;
    tags?:          Avg;
    tag?:           Avg;
    account?:       RolloverOverride;
}

export interface Properties5 {
    id:            Deleted;
    name:          Deleted;
    name_override: Deleted;
    modified:      Deleted;
    type:          Deleted;
    category:      RolloverOverride;
    counts:        Counts;
    deleted:       Deleted;
    meta_tag:      Deleted;
    extra:         Deleted;
}

export interface Counts {
    javaType:    string;
    type:        TypeEnum;
    description: string;
    required:    string[];
    readonly:    boolean;
    properties:  Properties6;
}

export interface Properties6 {
    entries:          Deleted;
    unsorted_entries: Deleted;
    budgets:          Deleted;
}
