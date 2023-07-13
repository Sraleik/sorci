# Reference

## insertEvents(events)

This function is used to insert new events into the stream.
No concurency check are done.
This function is a tooling function. Design to help during testing.

**Parameters**

- `events` - An array of event objects. Each event object should have the following properties:
  - `id?` - String?: The id of the event. An uuid v4 will be create automatically by postgres if not provided
  - `type` - String: The type of the event.
  - `data` - Object: The payload of the event.
  - `identifier` - Object: The domain ids of the event.
  - `timestamp?` - Date: The creation time of the event. The timestamp will be created by postgres if not provided

**Return value**

This function returns a Promise that resolves with an array of event ids that were inserted.

**Example usage**

```typescript
let events = [
	{
		id: "2d51fb49-364e-41c1-8ec7-7cc60a3f0860"
		type: "movie-created"
		data:{
			movieId: 'dfaa1844-0d09-46af-ae03-7e7dad54e09e'
			title: 'Interstellar',
		}
		identifier: {
			movieId: 'dfaa1844-0d09-46af-ae03-7e7dad54e09e'
		}
		timestamp: new Date(),
	},
	{
		id: "51e89779-6188-4b01-9416-b3e03de9551d"
		type: "actor-created"
		data:{
			actorId: '6123ee66-ac77-4520-a984-bae888d19f53'
	    firsName: "Matthew",
	    lastName: "McConaughey",
    	dateOfBirth: new Date("1969-11-04"),
		}
		identifier: {
			actorId: 'dfaa1844-0d09-46af-ae03-7e7dad54e09e'
		}
		timestamp: new Date(),
	},
	{
		id: "51e89779-6188-4b01-9416-b3e03de9551d"
		type: "actor-performed-in-movie"
		data:{
			actorId: '6123ee66-ac77-4520-a984-bae888d19f53'
			movieId: 'dfaa1844-0d09-46af-ae03-7e7dad54e09e'
			character: "Joseph Cooper"
		}
		identifier: {
			actorId: '6123ee66-ac77-4520-a984-bae888d19f53'
			movieId: 'dfaa1844-0d09-46af-ae03-7e7dad54e09e'
		}
		timestamp: new Date(),
	}
];

sorci.insertEvents(events)
	.then(insertedEventIds => console.log(insertedEventIds))
	.catch(err => console.error(err));
```
