let gid = 0;

/** @typedef {function(any):void} Listener */

class EventBus {
    constructor() {
        /** @type {{[key:string]: Listener[]}} */
        this.listeners = {};
    }

    /**
     * @param {string} eventType
     * @param {Listener} listener
     */
    addListener(eventType, listener) {
        let listeners = this.listeners[eventType];
        if (!listeners) {
            listeners = [];
            this.listeners[eventType] = listeners;
        }
        listeners.push(listener);
    }

    /**
     * @param {string} eventType
     * @param {*} data
     */
    fireEvent(eventType, data) {
        const listeners = this.listeners[eventType];
        if (listeners) {
            listeners.forEach((listener) => {
                listener(data);
            });
        }
    }
}

const eventBus = new EventBus();

/** @typedef {{startMs:number, endMs?:number}} SerializedInterval */
/** @typedef {{id:number, name:string, intervals:SerializedInterval[], status:string}} SerializedTask */
/** @typedef {{tasks:SerializedTask[]}} SerializedModel */


class Model {
    constructor() {
        /** @type {Task[]} */
        this.tasks = [];
        this.load();

        eventBus.addListener('delete_task', (task) => {
            this.tasks.splice(this.tasks.indexOf(task), 1);
        });
    }

    addTask() {
        const task = new Task();
        this.tasks.push(task);
        return task;
    }

    persist() {
        localStorage.setItem('timetracker', JSON.stringify(this.serialize()));
    }

    serialize() {
        return { tasks: this.tasks.map(task => task.serialize()) };
    }

    load() {
        let serialized = localStorage.getItem('timetracker');
        if (serialized) {
            this.deserialize(JSON.parse(serialized));
        }
    }

    /** @param {SerializedModel} serialized */
    deserialize(serialized) {
        serialized.tasks.forEach((serializedTask) => {
            const task = new Task();
            task.deserialize(serializedTask);
            this.tasks.push(task);
        });
    }
}

class Task {
    constructor() {
        this.id = gid++;
        this.name = 'Task ' + this.id;
        /** @type {Interval[]} */
        this.intervals = [];
        this.status = TaskStatus.PAUSED;
    }

    toggle() {
        if (this.status === TaskStatus.PAUSED) {
            this.run();
        }
        else if (this.status === TaskStatus.RUNNING) {
            this.pause();
        }
    }

    run() {
        const interval = new Interval();
        this.intervals.push(interval);
        interval.start();
        this.status = TaskStatus.RUNNING;
    }

    pause() {
        const interval = this.intervals[this.intervals.length - 1];
        interval.stop();
        this.status = TaskStatus.PAUSED;
    }

    elapsed() {
        return this.intervals.map(interval => interval.elapsed()).reduce((p, c) => p + c, 0);
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            intervals: this.intervals.map(interval => interval.serialize()),
            status: this.status,
        };
    }

    /** @param {SerializedTask} serialized */
    deserialize(serialized) {
        this.id = serialized.id;
        this.name = serialized.name;
        serialized.intervals.forEach(serializedInterval => {
            const interval = new Interval();
            interval.deserialize(serializedInterval);
            this.intervals.push(interval);
        });
        this.status = serialized.status;

        gid = this.id++;
    }
}

class TaskStatus {
    static get RUNNING() {
        return 'RUNNING';
    };

    static get PAUSED() {
        return 'PAUSED';
    };
}

class Interval {
    constructor() {
        this.startMs;
        this.endMs;
    }

    start() {
        this.startMs = Date.now();
    }

    stop() {
        this.endMs = Date.now();
    }

    elapsed() {
        let endMs = this.endMs || Date.now();
        return endMs - this.startMs;
    }

    serialize() {
        return {
            startMs: this.startMs,
            endMs: this.endMs,
        };
    }

    /** @param {SerializedInterval} serialized */
    deserialize(serialized) {
        this.startMs = serialized.startMs;
        this.endMs = serialized.endMs;
    }
}

class View {
    /** @param {Model} model */
    constructor(model) {
        this.model = model;

        this.addTaskActionEl = document.createElement('button');
        const ligature = this.addTaskActionEl.appendChild(createLigatureElement('add'));
        this.addTaskActionEl.addEventListener('click', () => {
            this.onAddTaskClick();
        });

        this.taskTableEl = new TaskTableEl();

        document.body.appendChild(this.addTaskActionEl);
        document.body.appendChild(this.taskTableEl.element);

        window.addEventListener('unload', () => {
            this.model.persist();
        });

        this.model.tasks.forEach((task) => {
            this.taskTableEl.addTask(task);
        });
    }

    start() {
        setInterval(() => {
            this.taskTableEl.updateDurations();
        }, 100);
    }

    onAddTaskClick() {
        this.taskTableEl.addTask(this.model.addTask());
    }
}

class TaskTableEl {
    constructor() {
        this.element = document.createElement('table');
        this.taskTableBodyEl = document.createElement('tbody');

        this.element.appendChild(this.taskTableBodyEl);

        /** @type {TaskTableRowEl[]} */
        this.rowEls = [];

        eventBus.addListener('delete_task', (task) => {
            const i = this.rowEls.findIndex((taskEl) => taskEl.task === task);
            this.taskTableBodyEl.removeChild(this.rowEls[i].element);
            this.rowEls.splice(i, 1);
        });
    }

    /** @param {Task} task */
    addTask(task) {
        const rowEl = new TaskTableRowEl(task);
        this.rowEls.push(rowEl);
        this.taskTableBodyEl.appendChild(rowEl.element);
    }

    updateDurations() {
        this.rowEls.forEach((rowEl) => {
            rowEl.updateDuration();
        });
    }
}

class TaskTableRowEl {
    /** @param {Task} task */
    constructor(task) {
        this.task = task;
        this.element = document.createElement('tr');
        this.nameInputEl = document.createElement('input');
        // TODO

        this.elapsedEl = document.createElement('td');

        this.statusToggleEl = document.createElement('button');
        this.statusToggleEl.addEventListener('click', () => {
            this.onStatusToggleClick();
        });
        this.statusToggleLigatureEl = createLigatureElement();

        this.deleteButtonEl = document.createElement('button');
        this.deleteButtonEl.addEventListener('click', () => {
            this.onDeleteButtonClick();
        });

        this.element.appendChild(document.createElement('td')).appendChild(this.nameInputEl);
        this.element.appendChild(this.elapsedEl);
        this.element.appendChild(document.createElement('td')).appendChild(this.statusToggleEl).appendChild(this.statusToggleLigatureEl);
        this.element.appendChild(document.createElement('td')).appendChild(this.deleteButtonEl).appendChild(createLigatureElement('delete'));

        this.nameInputEl.value = this.task.name;
        this.updateDuration(true);
        this.updateStatus();
    }

    /** @param {boolean=false} force */
    updateDuration(force = false) {
        if (force || this.task.status === TaskStatus.RUNNING) {
            this.elapsedEl.innerText = formatDuration(this.task.elapsed());
        }
    }

    onStatusToggleClick() {
        this.task.toggle();
        this.updateStatus();
    }

    updateStatus() {
        if (this.task.status === TaskStatus.RUNNING) {
            this.statusToggleLigatureEl.innerText = 'pause';
        } else if (this.task.status === TaskStatus.PAUSED) {
            this.statusToggleLigatureEl.innerText = 'play_arrow';
        }
    }

    onDeleteButtonClick() {
        eventBus.fireEvent('delete_task', this.task);
    }
}

/** @param {number} durationMs */
function formatDuration(durationMs) {
    let s = Math.floor(durationMs / 1000);
    let m = Math.floor(s / 60);
    let h = Math.floor(m / 60);
    s %= 60;
    m %= 60;
    s = s < 10 ? '0' + s : String(s);
    m = m < 10 ? '0' + m : String(m);
    return h + ':' + m + ':' + s;
}

/** @param {string=} name */
function createLigatureElement(name) {
    const ligatureEl = document.createElement('i');
    ligatureEl.setAttribute('class', 'material-icons')
    ligatureEl.innerText = name;
    return ligatureEl;
}

setTimeout(() => {
    const model = new Model();
    const view = new View(model);
    view.start();
});