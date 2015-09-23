import Immutable from 'immutable';

import updateDeep from './updateDeep';
import mergeChanges from './mergeChanges';

export default function ImmutableIndexByObserver(cursor, iteratee) {
  if (Tracker.active) {
    throw new Error("This can't be used inside reactive computations; it could cause infinite invalidate loops");
  }

  if (typeof iteratee === 'string' ||
      typeof iteratee === 'number') {
    let key = iteratee;
    iteratee = document => document.get(key);
  }
  else if (iteratee instanceof Array) {
    let path = iteratee;
    iteratee = document => document.getIn(path);
  }

  let documents;
  let dep = new Tracker.Dependency();

  function update(newDocuments) {
    documents = newDocuments;
    dep.changed();
  }

  let keyMap = {};
  let initialDocuments = {};
  let handle = cursor.observeChanges({
    added: (id, fields) => {
      fields._id = id;
      let document = Immutable.fromJS(fields);
      let key = iteratee(document);
      if (initialDocuments) {
        if (initialDocuments.hasOwnProperty(key)) {
          throw new Error("Key (" + key + ") for added document _id " + id + " conflicts with a pre-existing document");
        }
        initialDocuments[key] = document;
      }
      else {
        if (documents.has(key)) {
          throw new Error("Key (" + key + ") for added document _id " + id + " conflicts with a pre-existing document");
        }
        update(documents.set(key, document));
      }
      keyMap[id] = key;
    },
    changed: (id, fields) => {
      let key = keyMap[id];
      let document = mergeChanges(documents.get(key), fields);
      let newKey = iteratee(document);
      if (key !== newKey) {
        if (documents.has(newKey)) {
          throw new Error("Key for document _id " + id + " has changed from " + key + " to " + newKey +
            ", which conflicts with a pre-existing document, because of changed fields: " + JSON.stringify(fields));
        }
        keyMap[id] = newKey;
        update(documents.withMutations(documents => {
          documents.delete(key);
          documents.set(newKey, document);
        }));
      }
      else {
        update(documents.set(key, document));
      }
    },
    removed: (id) => {
      let key = keyMap[id];
      delete keyMap[id];
      update(documents.delete(key));
    },
  });
  documents = Immutable.Map(initialDocuments);
  initialDocuments = undefined;

  return {
    documents() {
      dep.depend();
      return documents; 
    },
    stop() {
      handle.stop();
    }
  };
}