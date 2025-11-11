// To parse this data:
//
//   import { Convert, ToshlTypes } from "./file";
//
//   const toshlTypes = Convert.toToshlTypes(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface ToshlTypes {
    javaType:    string;
    id:          string;
    $schema:     string;
    type:        TypeEnum;
    extends:     Extends;
    title:       string;
    description: string[];
    properties:  ToshlTypesProperties;
    links:       Link[];
}

export interface Extends {
    $ref: string;
}

export interface Link {
    rel:         string;
    href:        string;
    title?:      string;
    description: string[] | string;
    scope?:      Scope;
    schema?:     Schema;
    method?:     string;
}

export interface Schema {
    type:       TypeEnum;
    required:   string[];
    properties: SchemaProperties;
}

export interface SchemaProperties {
    id?:          Account;
    amount?:      Amount;
    currency?:    Currency;
    date?:        Account;
    desc?:        Account;
    account?:     Account;
    category?:    Account;
    tags?:        Account;
    location?:    Location;
    repeat?:      Repeat;
    transaction?: PurpleTransaction;
    images?:      PurpleImages;
    reminders?:   Reminders;
    split?:       Split;
    completed?:   Account;
    extra?:       Account;
    modified?:    Account;
}

export interface AccountProperties {
    code?:       Account;
    rate?:       Account;
    main_rate?:  Account;
    fixed?:      Account;
    id?:         Account;
    connection?: Account;
    memo?:       Account;
    payee?:      Account;
    pending?:    Account;
    type?:       TypeClass;
    completed?:  Account;
    parent?:     Account;
    children?:   Account;
}

export interface Account {
    type:              TypeEnum;
    title?:            string;
    description:       string;
    default?:          boolean | string;
    pattern?:          string;
    readonly?:         boolean;
    format?:           string;
    maxLength?:        number;
    javaType?:         string;
    minimum?:          number;
    enum?:             string[];
    maximum?:          number;
    exclusiveMinimum?: boolean;
    properties?:       AccountProperties;
    items?:            AccountItems;
}

export interface TypeClass {
    type:     TypeEnum;
    javaType: string;
    enum:     string[];
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

export interface AccountItems {
    type: TypeEnum;
}

export interface Amount {
    type:             TypeEnum;
    title:            string;
    description:      string;
    minimum:          number;
    exclusiveMinimum: boolean;
    maximum:          number;
    exclusiveMaximum: boolean;
}

export interface Currency {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  PurpleProperties;
}

export interface PurpleProperties {
    code:      Account;
    rate:      Rate;
    main_rate: Account;
    fixed:     Account;
}

export interface Rate {
    type:             TypeEnum;
    title:            string;
    description:      string;
    minimum:          number;
    exclusiveMinimum: boolean;
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
    properties:      FluffyProperties;
}

export interface FluffyProperties {
    id: Account;
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
    id:        Account;
    venue_id:  Account;
    latitude:  Account;
    longitude: Account;
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
    properties:      TentacledProperties;
}

export interface TentacledProperties {
    period: Period;
    number: Number;
    at:     Account;
}

export interface Number {
    type:        TypeEnum;
    description: string;
    minimum:     number;
    maximum:     number;
}

export interface Period {
    type:        TypeEnum;
    description: string;
    enum:        string[];
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
    id:         Account;
    start:      Account;
    end:        Account;
    frequency:  Account;
    interval:   Account;
    count:      Account;
    byday:      Account;
    bymonthday: Account;
    bysetpos?:  Account;
    iteration:  Account;
}

export interface Split {
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  StickyProperties;
}

export interface StickyProperties {
    parent: Account;
}

export interface PurpleTransaction {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  IndigoProperties;
}

export interface IndigoProperties {
    id:       Account;
    account:  Account;
    currency: Currency;
}

export interface Scope {
    anyOf: string[];
}

export interface ToshlTypesProperties {
    id:          Account;
    amount:      Amount;
    currency:    Account;
    date:        Account;
    desc:        Account;
    account:     Account;
    category:    Account;
    tags:        Account;
    location:    Location;
    created:     Account;
    modified:    Account;
    repeat:      Extends;
    transaction: FluffyTransaction;
    images:      FluffyImages;
    reminders:   Reminders;
    import:      Account;
    review:      Account;
    settle:      Account;
    split:       Account;
    completed:   Account;
    deleted:     Account;
    extra:       Account;
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
    properties:      IndecentProperties;
}

export interface IndecentProperties {
    id:       Account;
    path:     Account;
    filename: Account;
    type:     Account;
    status:   Account;
}

export interface FluffyTransaction {
    javaType:    string;
    type:        TypeEnum;
    title:       string;
    description: string;
    required:    string[];
    properties:  HilariousProperties;
}

export interface HilariousProperties {
    id:       Account;
    amount:   Amount;
    account:  Account;
    currency: Account;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toToshlTypes(json: string): ToshlTypes {
        return cast(JSON.parse(json), r("ToshlTypes"));
    }

    public static toshlTypesToJson(value: ToshlTypes): string {
        return JSON.stringify(uncast(value, r("ToshlTypes")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "ToshlTypes": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "id", js: "id", typ: "" },
        { json: "$schema", js: "$schema", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "extends", js: "extends", typ: r("Extends") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: a("") },
        { json: "properties", js: "properties", typ: r("ToshlTypesProperties") },
        { json: "links", js: "links", typ: a(r("Link")) },
    ], false),
    "Extends": o([
        { json: "$ref", js: "$ref", typ: "" },
    ], false),
    "Link": o([
        { json: "rel", js: "rel", typ: "" },
        { json: "href", js: "href", typ: "" },
        { json: "title", js: "title", typ: u(undefined, "") },
        { json: "description", js: "description", typ: u(a(""), "") },
        { json: "scope", js: "scope", typ: u(undefined, r("Scope")) },
        { json: "schema", js: "schema", typ: u(undefined, r("Schema")) },
        { json: "method", js: "method", typ: u(undefined, "") },
    ], false),
    "Schema": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("SchemaProperties") },
    ], false),
    "SchemaProperties": o([
        { json: "id", js: "id", typ: u(undefined, r("Account")) },
        { json: "amount", js: "amount", typ: u(undefined, r("Amount")) },
        { json: "currency", js: "currency", typ: u(undefined, r("Currency")) },
        { json: "date", js: "date", typ: u(undefined, r("Account")) },
        { json: "desc", js: "desc", typ: u(undefined, r("Account")) },
        { json: "account", js: "account", typ: u(undefined, r("Account")) },
        { json: "category", js: "category", typ: u(undefined, r("Account")) },
        { json: "tags", js: "tags", typ: u(undefined, r("Account")) },
        { json: "location", js: "location", typ: u(undefined, r("Location")) },
        { json: "repeat", js: "repeat", typ: u(undefined, r("Repeat")) },
        { json: "transaction", js: "transaction", typ: u(undefined, r("PurpleTransaction")) },
        { json: "images", js: "images", typ: u(undefined, r("PurpleImages")) },
        { json: "reminders", js: "reminders", typ: u(undefined, r("Reminders")) },
        { json: "split", js: "split", typ: u(undefined, r("Split")) },
        { json: "completed", js: "completed", typ: u(undefined, r("Account")) },
        { json: "extra", js: "extra", typ: u(undefined, r("Account")) },
        { json: "modified", js: "modified", typ: u(undefined, r("Account")) },
    ], false),
    "AccountProperties": o([
        { json: "code", js: "code", typ: u(undefined, r("Account")) },
        { json: "rate", js: "rate", typ: u(undefined, r("Account")) },
        { json: "main_rate", js: "main_rate", typ: u(undefined, r("Account")) },
        { json: "fixed", js: "fixed", typ: u(undefined, r("Account")) },
        { json: "id", js: "id", typ: u(undefined, r("Account")) },
        { json: "connection", js: "connection", typ: u(undefined, r("Account")) },
        { json: "memo", js: "memo", typ: u(undefined, r("Account")) },
        { json: "payee", js: "payee", typ: u(undefined, r("Account")) },
        { json: "pending", js: "pending", typ: u(undefined, r("Account")) },
        { json: "type", js: "type", typ: u(undefined, r("TypeClass")) },
        { json: "completed", js: "completed", typ: u(undefined, r("Account")) },
        { json: "parent", js: "parent", typ: u(undefined, r("Account")) },
        { json: "children", js: "children", typ: u(undefined, r("Account")) },
    ], false),
    "Account": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: u(undefined, "") },
        { json: "description", js: "description", typ: "" },
        { json: "default", js: "default", typ: u(undefined, u(true, "")) },
        { json: "pattern", js: "pattern", typ: u(undefined, "") },
        { json: "readonly", js: "readonly", typ: u(undefined, true) },
        { json: "format", js: "format", typ: u(undefined, "") },
        { json: "maxLength", js: "maxLength", typ: u(undefined, 0) },
        { json: "javaType", js: "javaType", typ: u(undefined, "") },
        { json: "minimum", js: "minimum", typ: u(undefined, 0) },
        { json: "enum", js: "enum", typ: u(undefined, a("")) },
        { json: "maximum", js: "maximum", typ: u(undefined, 0) },
        { json: "exclusiveMinimum", js: "exclusiveMinimum", typ: u(undefined, true) },
        { json: "properties", js: "properties", typ: u(undefined, r("AccountProperties")) },
        { json: "items", js: "items", typ: u(undefined, r("AccountItems")) },
    ], false),
    "TypeClass": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "javaType", js: "javaType", typ: "" },
        { json: "enum", js: "enum", typ: a("") },
    ], false),
    "AccountItems": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
    ], false),
    "Amount": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "minimum", js: "minimum", typ: 0 },
        { json: "exclusiveMinimum", js: "exclusiveMinimum", typ: true },
        { json: "maximum", js: "maximum", typ: 0 },
        { json: "exclusiveMaximum", js: "exclusiveMaximum", typ: true },
    ], false),
    "Currency": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("PurpleProperties") },
    ], false),
    "PurpleProperties": o([
        { json: "code", js: "code", typ: r("Account") },
        { json: "rate", js: "rate", typ: r("Rate") },
        { json: "main_rate", js: "main_rate", typ: r("Account") },
        { json: "fixed", js: "fixed", typ: r("Account") },
    ], false),
    "Rate": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "minimum", js: "minimum", typ: 0 },
        { json: "exclusiveMinimum", js: "exclusiveMinimum", typ: true },
    ], false),
    "PurpleImages": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "maxItems", js: "maxItems", typ: 0 },
        { json: "items", js: "items", typ: r("PurpleItems") },
    ], false),
    "PurpleItems": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "extends", js: "extends", typ: r("Extends") },
        { json: "additionalItems", js: "additionalItems", typ: true },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("FluffyProperties") },
    ], false),
    "FluffyProperties": o([
        { json: "id", js: "id", typ: r("Account") },
    ], false),
    "Location": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("LocationProperties") },
    ], false),
    "LocationProperties": o([
        { json: "id", js: "id", typ: r("Account") },
        { json: "venue_id", js: "venue_id", typ: r("Account") },
        { json: "latitude", js: "latitude", typ: r("Account") },
        { json: "longitude", js: "longitude", typ: r("Account") },
    ], false),
    "Reminders": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "maxItems", js: "maxItems", typ: 0 },
        { json: "items", js: "items", typ: r("RemindersItems") },
    ], false),
    "RemindersItems": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "additionalItems", js: "additionalItems", typ: true },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("TentacledProperties") },
    ], false),
    "TentacledProperties": o([
        { json: "period", js: "period", typ: r("Period") },
        { json: "number", js: "number", typ: r("Number") },
        { json: "at", js: "at", typ: r("Account") },
    ], false),
    "Number": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "description", js: "description", typ: "" },
        { json: "minimum", js: "minimum", typ: 0 },
        { json: "maximum", js: "maximum", typ: 0 },
    ], false),
    "Period": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "description", js: "description", typ: "" },
        { json: "enum", js: "enum", typ: a("") },
    ], false),
    "Repeat": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("RepeatProperties") },
    ], false),
    "RepeatProperties": o([
        { json: "id", js: "id", typ: r("Account") },
        { json: "start", js: "start", typ: r("Account") },
        { json: "end", js: "end", typ: r("Account") },
        { json: "frequency", js: "frequency", typ: r("Account") },
        { json: "interval", js: "interval", typ: r("Account") },
        { json: "count", js: "count", typ: r("Account") },
        { json: "byday", js: "byday", typ: r("Account") },
        { json: "bymonthday", js: "bymonthday", typ: r("Account") },
        { json: "bysetpos", js: "bysetpos", typ: u(undefined, r("Account")) },
        { json: "iteration", js: "iteration", typ: r("Account") },
    ], false),
    "Split": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("StickyProperties") },
    ], false),
    "StickyProperties": o([
        { json: "parent", js: "parent", typ: r("Account") },
    ], false),
    "PurpleTransaction": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("IndigoProperties") },
    ], false),
    "IndigoProperties": o([
        { json: "id", js: "id", typ: r("Account") },
        { json: "account", js: "account", typ: r("Account") },
        { json: "currency", js: "currency", typ: r("Currency") },
    ], false),
    "Scope": o([
        { json: "anyOf", js: "anyOf", typ: a("") },
    ], false),
    "ToshlTypesProperties": o([
        { json: "id", js: "id", typ: r("Account") },
        { json: "amount", js: "amount", typ: r("Amount") },
        { json: "currency", js: "currency", typ: r("Account") },
        { json: "date", js: "date", typ: r("Account") },
        { json: "desc", js: "desc", typ: r("Account") },
        { json: "account", js: "account", typ: r("Account") },
        { json: "category", js: "category", typ: r("Account") },
        { json: "tags", js: "tags", typ: r("Account") },
        { json: "location", js: "location", typ: r("Location") },
        { json: "created", js: "created", typ: r("Account") },
        { json: "modified", js: "modified", typ: r("Account") },
        { json: "repeat", js: "repeat", typ: r("Extends") },
        { json: "transaction", js: "transaction", typ: r("FluffyTransaction") },
        { json: "images", js: "images", typ: r("FluffyImages") },
        { json: "reminders", js: "reminders", typ: r("Reminders") },
        { json: "import", js: "import", typ: r("Account") },
        { json: "review", js: "review", typ: r("Account") },
        { json: "settle", js: "settle", typ: r("Account") },
        { json: "split", js: "split", typ: r("Account") },
        { json: "completed", js: "completed", typ: r("Account") },
        { json: "deleted", js: "deleted", typ: r("Account") },
        { json: "extra", js: "extra", typ: r("Account") },
    ], false),
    "FluffyImages": o([
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "maxItems", js: "maxItems", typ: 0 },
        { json: "items", js: "items", typ: r("FluffyItems") },
    ], false),
    "FluffyItems": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "extends", js: "extends", typ: r("Extends") },
        { json: "additionalItems", js: "additionalItems", typ: true },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("IndecentProperties") },
    ], false),
    "IndecentProperties": o([
        { json: "id", js: "id", typ: r("Account") },
        { json: "path", js: "path", typ: r("Account") },
        { json: "filename", js: "filename", typ: r("Account") },
        { json: "type", js: "type", typ: r("Account") },
        { json: "status", js: "status", typ: r("Account") },
    ], false),
    "FluffyTransaction": o([
        { json: "javaType", js: "javaType", typ: "" },
        { json: "type", js: "type", typ: r("TypeEnum") },
        { json: "title", js: "title", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "required", js: "required", typ: a("") },
        { json: "properties", js: "properties", typ: r("HilariousProperties") },
    ], false),
    "HilariousProperties": o([
        { json: "id", js: "id", typ: r("Account") },
        { json: "amount", js: "amount", typ: r("Amount") },
        { json: "account", js: "account", typ: r("Account") },
        { json: "currency", js: "currency", typ: r("Account") },
    ], false),
    "TypeEnum": [
        "array",
        "boolean",
        "date",
        "integer",
        "number",
        "object",
        "string",
    ],
};
