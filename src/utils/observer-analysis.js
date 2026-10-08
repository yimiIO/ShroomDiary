'use strict';

function savedObservers(analysis) {
 const observations = (analysis && analysis.observations) || [];
 // A failed rerun can retain old results alongside the new task snapshot.
 // Use the observers that actually produced the saved results in that case.
 if (analysis && analysis.status === 'done' && observations.length) return observations.map(item => item.observer).filter(Boolean);
 return (analysis && analysis.observers && analysis.observers.length) ? analysis.observers : observations.map(item => item.observer).filter(Boolean);
}

function observerChanged(current, saved, analysis) {
 if (!saved) return true;
 if (['id', 'name', 'description', 'renderType'].some(key => (current[key] || '') !== (saved[key] || ''))) return true;
 if (typeof saved.instructions === 'string') return (current.instructions || '') !== saved.instructions;
 // Older snapshots omitted instructions. An edit after the task started also
 // invalidates their settings match, without modifying the saved analysis.
 const baseline = saved.updatedAt || (analysis && (analysis.startedAt || analysis.createdAt));
 return Boolean(baseline && current.updatedAt && Date.parse(current.updatedAt) > Date.parse(baseline));
}

function observerSettingsChanged(configured, analysis) {
 if (!analysis) return false;
 const current = configured.filter(item => item.enabled);
 const saved = savedObservers(analysis);
 return current.length !== saved.length || current.some((item, index) => observerChanged(item, saved[index], analysis));
}

function displayedObservations(configured, analysis, settingsLoaded, showSaved = false) {
 const observations = (analysis && analysis.observations) || [];
 const observers = settingsLoaded && !showSaved ? configured.filter(item => item.enabled) : savedObservers(analysis);
 return observers.map(observer => {
  const saved = observations.find(item => item.observer && item.observer.id === observer.id);
  return { observer: saved ? saved.observer : observer, label: observer.shortName || observer.name, result: saved ? saved.result : {}, pending: !saved };
 });
}

module.exports = { displayedObservations, observerSettingsChanged, savedObservers };
