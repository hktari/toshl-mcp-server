# Get entry

Get an entry.

```
GET /entries/{id}
```

Required [scope](https://developer.toshl.com/docs/auth#scope):

- entries:r

## Parameters

|                                     |           |
| ----------------------------------- | --------- |
| **id \***<br>_required_<br>`string` | Entry id. |

**\*** denotes _required_ field/parameter.

## Request

```
$ curl https://api.toshl.com/entries/42 \
  -H "Authorization: Bearer $TOSHL_API_TOKEN"
```

## Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "42",
  "amount": -13.37,
  "currency": {
    "code": "USD",
    "rate": 1,
    "fixed": false
  },
  "date": "2012-09-04",
  "desc": "Entry description",
  "account": "45",
  "category": "42",
  "tags": ["42", "43"],
  "location": {
    "id": "44",
    "latitude": 46.051426,
    "longitude": 14.505966
  },
  "modified": "2012-09-04T13:55:15Z",
  "repeat": {
    "id": "41",
    "frequency": "monthly",
    "interval": 1,
    "start": "2012-09-04",
    "count": 10,
    "iteration": 1,
    "template": true
  },
  "images": [{
    "id": "43",
    "path": "https://img.toshl.com/12/1404134603-ab820800-954f-46a7-95ff-fee7d961b31f/",
    "status": "uploaded"
  }],
  "reminders": [{
    "period": "week",
    "number": 2,
    "at": "11:25"
  }],
  "completed": false
}
```

Page last modified: 08 Jan 2024
